// F10 — permanent regression test for adapters/index.js's resolveAdapter() and each
// adapter's matches(). Pure URL-matching logic — no browser/Playwright needed, so
// this runs even though the browser-dependent parts of these adapters can't be
// tested in this environment (see the leverAdapter.js file comment on the 403s hit
// trying to fetch real Lever postings directly).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAdapter } = require('../src/adapters');

test('resolveAdapter: routes real Greenhouse/Lever/Ashby URLs to the right adapter', () => {
  assert.equal(resolveAdapter('https://job-boards.greenhouse.io/thehonestcompanysandbox/jobs/140167').platform, 'greenhouse');
  assert.equal(resolveAdapter('https://jobs.lever.co/voltus/f13d367c-97c1-4af3-8e8b-06827017fee2').platform, 'lever');
  assert.equal(resolveAdapter('https://jobs.ashbyhq.com/some-company/some-posting-id').platform, 'ashby');
});

test('resolveAdapter: a non-ATS URL falls through to genericAdapter (F8, scaffolded — not gone, but never actually used until applyBotSelect.js\'s APPLY_BOT_GENERIC_ENABLED gate is on)', () => {
  assert.equal(resolveAdapter('https://remotive.com/remote-jobs/some-job').platform, 'generic');
});

test('resolveAdapter: returns null for a malformed URL rather than throwing', () => {
  assert.equal(resolveAdapter('not-a-url'), null);
});

test('every registered adapter is usesBrowser (Contract A correction, 2026-08-17): none are API-based', () => {
  const { ADAPTERS } = require('../src/adapters');
  for (const adapter of ADAPTERS) {
    assert.ok(typeof adapter.matches === 'function', `${adapter.platform} must export matches()`);
    assert.ok(typeof adapter.login === 'function', `${adapter.platform} must export login() — all current adapters are browser-based`);
    assert.ok(typeof adapter.fillApplication === 'function', `${adapter.platform} must export fillApplication()`);
  }
});

// F8a - the other half of the cross-service contract. The backend rewrites an
// employer-hosted Greenhouse posting to this embed URL (see
// backend/src/services/applyBotPlatform.js resolveNavigationUrl); the worker must
// then route it to the verified Greenhouse adapter and NOT to genericAdapter.
// Asserted here rather than by importing across the service boundary, because this
// resolver is deliberately its own copy (see this file header).
test('resolveAdapter: the F8a Greenhouse embed URL routes to the Greenhouse adapter', () => {
  const adapter = resolveAdapter('https://boards.greenhouse.io/embed/job_app?token=8054862');
  assert.ok(adapter, 'embed URL must resolve to an adapter');
  assert.equal(adapter.platform, 'greenhouse', 'must NOT fall through to genericAdapter');
});

// ---------------------------------------------------------------------------
// F8 - genericAdapter, now that it is implemented rather than scaffolded.
// These drive the real adapter against real DOM via Playwright's setContent, so
// they exercise the same scanFields -> bestMatch -> nth(index) path production
// uses. Playwright is required lazily inside each test body: a top-level require
// throws at discovery time even for skipped tests.
// ---------------------------------------------------------------------------
const genericAdapter = require('../src/adapters/genericAdapter');
const { isSafeUrl } = require('../src/engine/ssrfGuard');

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
const pwSkip = playwrightAvailable() ? false : 'requires Playwright to be installed';

const PROFILE = {
  fullName: 'Ayesha Khan',
  email: 'ayesha@example.test',
  resumeFileName: 'ayesha-cv.pdf',
  resumeBuffer: Buffer.from('%PDF-1.4 fake resume for testing'),
};

// A form a generic engine SHOULD handle: required fields present under ordinary
// labels, plus a couple it cannot supply, which must be recorded not guessed.
const MAPPABLE_FORM = `
<!doctype html><html><body><form>
  <label for="nm">Full Name</label><input id="nm" type="text" />
  <label for="em">Email address</label><input id="em" type="text" />
  <label for="rs">Upload resume</label><input id="rs" type="file" />
  <label for="ph">Phone</label><input id="ph" type="tel" />
  <button type="submit">Submit Application</button>
</form></body></html>`;

// A form it should NOT touch: no file input at all and nothing resembling a name
// or email. The correct outcome is an abstain, not a best guess.
const UNMAPPABLE_FORM = `
<!doctype html><html><body><form>
  <label for="a">Widget colour</label><input id="a" type="text" />
  <label for="b">Reference code</label><input id="b" type="text" />
  <label for="c">Preferred delivery window</label><input id="c" type="text" />
  <button type="submit">Submit Application</button>
</form></body></html>`;

async function withPage(html, fn) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test('genericAdapter: fills a mappable form and clears the confidence threshold', { skip: pwSkip }, async () => {
  const result = await withPage(MAPPABLE_FORM, async (page) => {
    const r = await genericAdapter.fillApplication(page, PROFILE);
    r.typedName = await page.inputValue('#nm');
    r.typedEmail = await page.inputValue('#em');
    return r;
  });

  assert.equal(result.typedName, PROFILE.fullName, 'the name must actually be typed into the page');
  assert.equal(result.typedEmail, PROFILE.email);
  assert.equal(result.fieldsFilled.resume_upload, 'ayesha-cv.pdf');
  // 70 = above worker.js's LOW_CONFIDENCE_THRESHOLD (60), below the 80 the
  // selector-verified ATS adapters report.
  assert.equal(result.confidence, 70);
  // Phone is asked for but unsupplyable - recorded as unmapped, never invented.
  assert.equal(result.fieldsFilled.phone.unmapped, true);
});

test('genericAdapter: abstains on an unmappable form rather than guessing', { skip: pwSkip }, async () => {
  const result = await withPage(UNMAPPABLE_FORM, async (page) => {
    const r = await genericAdapter.fillApplication(page, PROFILE);
    r.values = [await page.inputValue('#a'), await page.inputValue('#b'), await page.inputValue('#c')];
    return r;
  });

  // Below LOW_CONFIDENCE_THRESHOLD -> worker.js records skipped_low_confidence.
  assert.ok(result.confidence < 60, `expected an abstain, got confidence ${result.confidence}`);
  assert.equal(result.confidence, 30);
  // The part that actually matters: it did not put a name or email into whichever
  // text box happened to be first.
  assert.deepEqual(result.values, ['', '', ''], 'no unrelated field may be written to');
  assert.equal(result.fieldsFilled.email, undefined);
  assert.equal(result.fieldsFilled.full_name, undefined);
});

test('genericAdapter: a resume upload alone is not enough to submit', { skip: pwSkip }, async () => {
  // Guards the abstain rule from the other direction - finding the file input must
  // not on its own carry a form over the line.
  const RESUME_ONLY = `<!doctype html><html><body><form>
    <label for="rs">Resume</label><input id="rs" type="file" />
    <label for="x">Widget colour</label><input id="x" type="text" />
  </form></body></html>`;
  const result = await withPage(RESUME_ONLY, (page) => genericAdapter.fillApplication(page, PROFILE));
  assert.equal(result.confidence, 30);
  assert.equal(result.fieldsFilled.resume_upload, 'ayesha-cv.pdf', 'it may still attach it');
  assert.equal(result.fieldsFilled.email, undefined, 'but there is no email, so it must abstain');
});

test('genericAdapter: locateSubmit does not match an unrelated "apply" link', { skip: pwSkip }, async () => {
  // An unanchored /submit|apply/ would match "Apply to other jobs". On a form of
  // unknown structure a wrong click is worse than finding no button at all.
  const DECOY = `<!doctype html><html><body>
    <button>Apply to other jobs</button>
    <button>Submit Application</button>
  </body></html>`;
  // locateSubmit() is async (see MEMORY.md's F8/F10 entries): a Playwright Locator
  // is always truthy regardless of match count, so this fixture happened to pass
  // under the old synchronous code purely by coincidence -- pattern #1 ("submit
  // application") exists on THIS page, so the fallback logic it claims to test was
  // never actually exercised. See the next test for a fixture that actually does.
  const chosen = await withPage(DECOY, async (page) => {
    const locator = await genericAdapter.locateSubmit(page);
    return locator.innerText();
  });
  assert.equal(chosen, 'Submit Application');
});

test('genericAdapter: locateSubmit falls back correctly when pattern #1 does not exist on the page', { skip: pwSkip }, async () => {
  // Proves the actual fallback mechanism the previous test's fixture never
  // exercised: no button reads "Submit Application" here, only "Apply Now"
  // (pattern #4). See MEMORY.md's F8 entry for how this was originally confirmed
  // broken (candidate.count() === 0, yet the old truthy check still passed).
  const APPLY_NOW_ONLY = `<!doctype html><html><body>
    <button>Apply Now</button>
  </body></html>`;
  const { count, text } = await withPage(APPLY_NOW_ONLY, async (page) => {
    const locator = await genericAdapter.locateSubmit(page);
    return { count: await locator.count(), text: await locator.innerText() };
  });
  assert.equal(count, 1, 'must actually resolve to the real button, not a zero-match locator');
  assert.equal(text, 'Apply Now');
});

test('genericAdapter: does not report a field as filled if the fill genuinely fails', { skip: pwSkip }, async () => {
  // The original swallowed fill()/setInputFiles() errors and recorded
  // fieldsFilled[key] unconditionally regardless of whether the write actually
  // happened -- directly undermining the abstain rule (see MEMORY.md's F8 entry).
  const DISABLED_EMAIL_FORM = `<!doctype html><html><body><form>
    <label for="nm">Full Name</label><input id="nm" type="text" />
    <label for="em">Email address</label><input id="em" type="text" disabled />
    <label for="rs">Upload resume</label><input id="rs" type="file" />
  </form></body></html>`;
  const result = await withPage(DISABLED_EMAIL_FORM, (page) => genericAdapter.fillApplication(page, PROFILE));
  assert.equal(result.fieldsFilled.email, undefined, 'a genuinely failed fill must not be reported as filled');
  assert.equal(result.confidence, 30, 'missing a required field must abstain, not report the ATS-adapter-tier 70');
});

// F8's own SSRF regression, per TEST_PLAN. The guard was built ahead of time for
// exactly this feature: generic URLs are the only ones that are not a known ATS
// hostname, so they are the ones that could point anywhere.
test('F8 SSRF: a generic-engine URL pointing at an internal address is refused', async () => {
  // isSafeUrl returns a plain boolean, not a {safe} object.
  assert.equal(await isSafeUrl('http://169.254.169.254/latest/meta-data/'), false, 'cloud metadata endpoint');
  assert.equal(await isSafeUrl('http://127.0.0.1:5000/api/internal/apply-bot/claim'), false, 'loopback');
  assert.equal(await isSafeUrl('http://10.0.0.5/apply'), false, 'RFC1918');
  assert.equal(await isSafeUrl('ftp://example.com/apply'), false, 'non-http scheme');
  // And a genuinely public generic destination must still be allowed through, or
  // the guard would be blocking the feature rather than protecting it.
  assert.equal(await isSafeUrl('https://remotive.com/remote-jobs/some-job'), true, 'a real public posting');
});

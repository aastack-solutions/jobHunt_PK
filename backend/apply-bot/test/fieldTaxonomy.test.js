// F10 — fieldTaxonomy.js's bestMatch()/scanFields() against a fixture HTML page.
// Un-skipped 2026-08-19 (F3 verification session) now that Playwright's Chromium
// is actually installed locally. `playwright` is still required lazily, inside the
// test body below, not here — a top-level require throws immediately if Playwright
// isn't installed, even before the skip check runs (skip only skips the test body,
// not module-level requires), so this file must keep working in an environment
// without it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanFields, bestMatch, CONFIDENCE, MIN_CONFIDENCE_TO_FILL } = require('../src/engine/fieldTaxonomy');

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
const skipReason = playwrightAvailable() ? false : 'requires Playwright to be installed (npm install + npx playwright install chromium)';

// A small, realistic fixture covering the required fields plus one deliberately
// ambiguous field, so this test can assert both "finds what it should" and
// "doesn't over-claim on what it shouldn't."
const FIXTURE_HTML = `
<!doctype html><html><body>
  <form>
    <label for="fname">First Name</label><input id="fname" type="text" />
    <label for="email">Email address</label><input id="email" type="text" />
    <label for="resume">Resume</label><input id="resume" type="file" />
    <label>Some unrelated field</label><input type="text" name="widget_color" />
  </form>
</body></html>`;

test('fieldTaxonomy: finds email/first_name/resume_upload with high confidence in a real DOM',
  { skip: skipReason },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);

    const fields = await scanFields(page);
    assert.ok(bestMatch(fields, 'email'), 'should find the email field');
    assert.ok(bestMatch(fields, 'first_name'), 'should find the first name field');
    assert.ok(bestMatch(fields, 'resume_upload'), 'should find the file upload as resume');
    assert.equal(bestMatch(fields, 'phone'), null, 'should NOT claim a phone match that is not there');

    await browser.close();
  }
);

// ---------------------------------------------------------------------------
// F8b regression suite — the resume_upload scoring bug found by the §E corpus
// research (docs/apply-bot/01-research-plan.md §E, Finding 4). These need no
// browser: bestMatch() takes plain field records, so they are the exact shape
// scanFields() returns, transcribed from what four REAL Greenhouse embed forms
// actually served (coinbase, samsara, stripe, instacart — all four identical in
// the respects that matter here).
// ---------------------------------------------------------------------------

// Verbatim shape of the two file inputs on a live Greenhouse embed form: labelled
// "Attach", empty name, distinguished only by id.
const GREENHOUSE_EMBED_FILE_FIELDS = [
  { index: 0, tag: 'input', type: 'text', name: '', id: 'first_name', placeholder: '', ariaLabel: 'First Name', label: 'First Name*' },
  { index: 1, tag: 'input', type: 'text', name: '', id: 'email', placeholder: '', ariaLabel: 'Email', label: 'Email*' },
  { index: 2, tag: 'input', type: 'file', name: '', id: 'resume', placeholder: '', ariaLabel: '', label: 'Attach' },
  { index: 3, tag: 'input', type: 'file', name: '', id: 'cover_letter', placeholder: '', ariaLabel: '', label: 'Attach' },
];

test('resume_upload is found on a real Greenhouse embed form labelled only "Attach"', () => {
  const match = bestMatch(GREENHOUSE_EMBED_FILE_FIELDS, 'resume_upload');
  assert.ok(match, 'id="resume" on a file input is an unambiguous signal — must not abstain');
  assert.equal(match.field.id, 'resume', 'must pick the resume input, not the cover-letter one');
  assert.equal(match.confidence, CONFIDENCE.NAME_ATTR_TYPE_CONFIRMED);
  assert.ok(match.confidence >= MIN_CONFIDENCE_TO_FILL, 'must clear the fill threshold');
});

test('the cover-letter file input is never mistaken for the resume', () => {
  // Both are labelled "Attach", so anything keying off the visible label would have
  // a 50/50 shot. Only the id distinguishes them.
  const onlyCoverLetter = GREENHOUSE_EMBED_FILE_FIELDS.filter((f) => f.id !== 'resume');
  assert.equal(bestMatch(onlyCoverLetter, 'resume_upload'), null,
    'with the resume input removed, the cover-letter input must NOT be claimed as the resume');
});

test('the type-confirmed promotion applies only to file inputs, not to text fields', () => {
  // Same id, wrong element type — a text field called "resume" is not an upload, and
  // must stay at the un-promoted NAME_ATTR score (below the threshold, so no match).
  const textNamedResume = [{ index: 0, tag: 'input', type: 'text', name: 'resume', id: '', placeholder: '', ariaLabel: '', label: '' }];
  assert.equal(bestMatch(textNamedResume, 'resume_upload'), null,
    'resume_upload candidates are restricted to type="file" — a text field must not match');
});

test('a short synonym cannot hit on an unrelated id (word-boundary guard)', () => {
  // 'cv' is a resume synonym. Before the boundary guard, a plain includes() would
  // match any id containing those two letters.
  const decoy = [{ index: 0, tag: 'input', type: 'file', name: '', id: 'cvv_scan', placeholder: '', ariaLabel: '', label: 'Attach' }];
  assert.equal(bestMatch(decoy, 'resume_upload'), null, '"cvv_scan" must not match the "cv" synonym');

  const real = [{ index: 0, tag: 'input', type: 'file', name: '', id: 'applicant_cv', placeholder: '', ariaLabel: '', label: 'Attach' }];
  assert.ok(bestMatch(real, 'resume_upload'), '"applicant_cv" SHOULD match — underscore is a word boundary');
});

test('a labelled resume field still wins on label, not on the id/name fallback', () => {
  // Guards against the fix quietly becoming the primary path: an explicit label is
  // still stronger evidence than an id.
  const labelled = [{ index: 0, tag: 'input', type: 'file', name: '', id: 'x', placeholder: '', ariaLabel: '', label: 'Resume' }];
  const match = bestMatch(labelled, 'resume_upload');
  assert.equal(match.confidence, CONFIDENCE.EXACT_LABEL);
});

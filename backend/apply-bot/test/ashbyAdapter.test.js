// F6 code-review regression test: ashbyAdapter.js's fillApplication() used to
// locate each field via `page.locator('input, textarea, select').nth(index)`,
// where `index` came from a one-time scanFields() snapshot taken BEFORE any
// filling happened. If filling one field mutates the DOM (a validation-triggered
// re-render inserting/removing a sibling element — a real, observed pattern for
// this class of ATS: Greenhouse's own #resume input unmounts after a file is
// accepted, per F5's findings, and this adapter's own comments already flag Ashby
// as "more dynamically rendered than Greenhouse/Lever's"), the index-based lookup
// for a LATER field can silently resolve to the wrong live element. Fixed by
// preferring a stable `id`/`name` attribute selector over the positional index —
// see the comment on `locatorForField()` in the adapter itself, and MEMORY.md's
// 2026-08-20 F6 entry for the full writeup including how this was proven with a
// standalone script before being turned into this permanent test.
//
// ashbyAdapter.js requires fieldTaxonomy.js and captchaDetector.js, neither of
// which requires 'playwright' — but this test needs a real page, so playwright is
// required lazily inside the test body, same pattern as the other adapter tests
// in this directory.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fillApplication } = require('../src/adapters/ashbyAdapter');

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
const skipReason = playwrightAvailable()
  ? false
  : 'requires Playwright to be installed (npm install + npx playwright install chromium)';

// Simulates a real dynamic-form re-render: typing into the name field inserts a new
// sibling element immediately before the email field, shifting every later field's
// position in the live DOM by one — the exact scenario that broke the old
// index-based lookup.
const FIXTURE_HTML_WITH_MUTATION = `
<!doctype html><html><body>
  <form>
    <label for="_systemfield_name">Full Name</label>
    <input id="_systemfield_name" name="_systemfield_name" type="text" />
    <label for="_systemfield_email">Email</label>
    <input id="_systemfield_email" name="_systemfield_email" type="text" />
    <label for="_systemfield_resume">Resume</label>
    <input id="_systemfield_resume" name="_systemfield_resume" type="file" />
  </form>
  <script>
    document.getElementById('_systemfield_name').addEventListener('input', () => {
      const el = document.createElement('input');
      el.id = 'dynamic_injected';
      el.type = 'text';
      document.querySelector('form').insertBefore(el, document.getElementById('_systemfield_email'));
    });
  </script>
</body></html>`;

const profile = {
  fullName: 'Jamie Rivera',
  email: 'jamie@example.com',
  resumeBuffer: Buffer.from('%PDF-1.4 fake'),
  resumeFileName: 'resume.pdf',
};

test(
  'ashbyAdapter.fillApplication: email lands in the email field, not a sibling injected after the name field mutates the DOM',
  { skip: skipReason },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML_WITH_MUTATION);

      const { fieldsFilled } = await fillApplication(page, profile);

      assert.equal(fieldsFilled.email, profile.email, 'fieldsFilled should report the email as filled');
      const emailFieldValue = await page.locator('#_systemfield_email').inputValue();
      assert.equal(emailFieldValue, profile.email, 'the ACTUAL email input must contain the email');
      const injectedFieldValue = await page.locator('#dynamic_injected').inputValue();
      assert.equal(injectedFieldValue, '', 'the dynamically-injected element must be untouched, not accidentally filled with the email');
    } finally {
      await browser.close();
    }
  }
);

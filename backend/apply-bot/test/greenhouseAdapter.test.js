// F5 code-review regression test: greenhouseAdapter.js's fillApplication() confidence
// score must reflect what was actually LOCATED AND FILLED in the real form, not what
// data happened to be available in the input profile. Before this fix,
// `requiredOk` fell back to `profile.fullName` when `fieldsFilled.first_name` was
// unset, so a board where the first_name selector fails to match would still score
// confidence 90 (high enough to bypass the abstain rule and, in live mode, submit)
// even though the name field was left completely blank — see MEMORY.md's 2026-08-20
// F5 entry and the comment on `requiredOk` in the adapter itself.
//
// greenhouseAdapter.js requires fieldTaxonomy.js and captchaDetector.js, neither of
// which requires 'playwright' — but this test still needs a real page to run
// fillApplication() against, so playwright is required lazily inside the test body,
// same pattern as fieldTaxonomy.test.js/captchaDetector.test.js in this directory.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fillApplication } = require('../src/adapters/greenhouseAdapter');

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

// Deliberately has NO #first_name / job_application[first_name] element — simulates
// a board layout the selectors don't recognize, while still providing email and
// resume fields so those two required checks pass on their own.
const FIXTURE_HTML_NO_FIRST_NAME = `
<!doctype html><html><body>
  <form>
    <input id="email" name="job_application[email]" type="text" />
    <input id="resume" name="job_application[resume]" type="file" />
  </form>
</body></html>`;

const FIXTURE_HTML_WITH_FIRST_NAME = `
<!doctype html><html><body>
  <form>
    <input id="first_name" name="job_application[first_name]" type="text" />
    <input id="email" name="job_application[email]" type="text" />
    <input id="resume" name="job_application[resume]" type="file" />
  </form>
</body></html>`;

const profile = {
  fullName: 'Jamie Rivera',
  email: 'jamie@example.com',
  resumeBuffer: Buffer.from('%PDF-1.4 fake'),
  resumeFileName: 'resume.pdf',
};

test(
  'greenhouseAdapter.fillApplication: does NOT inflate confidence via profile.fullName when the first_name field cannot be located',
  { skip: skipReason },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML_NO_FIRST_NAME);

      const { fieldsFilled, confidence } = await fillApplication(page, profile);

      assert.equal(fieldsFilled.first_name, undefined, 'first_name was never located, so it must not appear in fieldsFilled');
      assert.equal(confidence, 40, 'confidence must reflect the unfilled name field, not fall back to profile.fullName being truthy');
    } finally {
      await browser.close();
    }
  }
);

test(
  'greenhouseAdapter.fillApplication: scores high confidence when first_name IS actually located and filled',
  { skip: skipReason },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML_WITH_FIRST_NAME);

      const { fieldsFilled, confidence } = await fillApplication(page, profile);

      assert.equal(fieldsFilled.first_name, 'Jamie', 'first_name should be located and filled from profile.fullName');
      assert.equal(confidence, 90);
    } finally {
      await browser.close();
    }
  }
);

// F10 — fieldTaxonomy.js's bestMatch()/scanFields() against a fixture HTML page.
// Un-skipped 2026-08-19 (F3 verification session) now that Playwright's Chromium
// is actually installed locally. `playwright` is still required lazily, inside the
// test body below, not here — a top-level require throws immediately if Playwright
// isn't installed, even before the skip check runs (skip only skips the test body,
// not module-level requires), so this file must keep working in an environment
// without it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanFields, bestMatch } = require('../src/engine/fieldTaxonomy');

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

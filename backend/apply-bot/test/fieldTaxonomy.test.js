// F10 — fieldTaxonomy.js's bestMatch()/scanFields() against a fixture HTML page.
// SKIPPED: scanFields() takes a real Playwright `page` object and calls
// page.evaluate() — there is no way to fake that without either a real browser
// (Playwright isn't installed in this environment — npm install never ran) or
// pulling in a DOM-emulation library (jsdom) as a new dependency, which wasn't
// judged worth adding just for this. Un-skip once Playwright is actually
// installed; the fixture below is ready to use as-is.
const { test } = require('node:test');
const assert = require('node:assert/strict');
// `playwright` is required lazily, inside the test body below, not here — a
// top-level require would throw as soon as Node discovers this file (playwright
// isn't installed yet), even though the test itself is marked skipped. Skipping a
// test only skips its body, not module-level requires.
const { scanFields, bestMatch } = require('../src/engine/fieldTaxonomy');

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
  { skip: 'requires a real Playwright browser — not installed in this environment yet' },
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

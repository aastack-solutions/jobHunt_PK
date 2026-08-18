// F10 — captchaDetector.js's looksLikeLoginPage() (and detectCaptcha/
// detectEmailVerification once F7 fills those in) against fixture pages.
// SKIPPED: same reason as fieldTaxonomy.test.js — these functions take a real
// Playwright `page` object; not runnable without Playwright actually installed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
// `playwright` is required lazily, inside each test body below, not here — see
// fieldTaxonomy.test.js's comment for why (skip only skips the test body, not
// module-level requires, and playwright isn't installed yet in this environment).
const { looksLikeLoginPage } = require('../src/engine/captchaDetector');

const LOGIN_PAGE_HTML = `
<!doctype html><html><body>
  <form>
    <input type="email" name="email" />
    <input type="password" name="password" />
    <button type="submit">Log in</button>
  </form>
</body></html>`;

const APPLICATION_FORM_HTML = `
<!doctype html><html><body>
  <form>
    <input type="text" name="name" />
    <input type="email" name="email" />
    <input type="file" name="resume" />
    <button type="submit">Submit Application</button>
  </form>
</body></html>`;

test('looksLikeLoginPage: true for a password field with no file upload',
  { skip: 'requires a real Playwright browser — not installed in this environment yet' },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(LOGIN_PAGE_HTML);
    assert.equal(await looksLikeLoginPage(page), true);
    await browser.close();
  }
);

test('looksLikeLoginPage: false for a real application form (has a file upload)',
  { skip: 'requires a real Playwright browser — not installed in this environment yet' },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(APPLICATION_FORM_HTML);
    assert.equal(await looksLikeLoginPage(page), false);
    await browser.close();
  }
);

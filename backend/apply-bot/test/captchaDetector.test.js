// F10 — captchaDetector.js's looksLikeLoginPage() (and detectCaptcha/
// detectEmailVerification once F7 fills those in) against fixture pages.
// Un-skipped 2026-08-19 (F3 verification session) — see fieldTaxonomy.test.js's
// comment for why `playwright` is still required lazily inside each test body.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeLoginPage } = require('../src/engine/captchaDetector');

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
const skipReason = playwrightAvailable() ? false : 'requires Playwright to be installed (npm install + npx playwright install chromium)';

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
  { skip: skipReason },
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
  { skip: skipReason },
  async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(APPLICATION_FORM_HTML);
    assert.equal(await looksLikeLoginPage(page), false);
    await browser.close();
  }
);

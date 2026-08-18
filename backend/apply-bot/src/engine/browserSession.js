// Playwright browser/context lifecycle. One context per ApplyTask, closed when the
// task finishes (submitted/failed/shadow_complete) — kept OPEN across a
// 'paused_captcha' state in Phase 2, since the live-view needs the same page.
const { chromium } = require('playwright');
const logger = require('../logger');
const { installSsrfGuard } = require('./ssrfGuard');

// Bounded object-level micro-retry for flaky selector waits only — adopted from the
// ProBot reference (autoappy.md §6.6). This is separate from and in addition to the
// "no BullMQ auto-retry on the whole task" rule; it only retries a single wait, never
// re-runs the whole adapter.
const RETRY_SCHEDULE_MS = [500, 1500, 3000];

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_SCHEDULE_MS.length; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_SCHEDULE_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_SCHEDULE_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

async function launchSession(sessionState) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    sessionState ? { storageState: sessionState } : undefined
  );
  // SSRF guard applies to EVERY session, not just adapters that navigate to
  // arbitrary hosts — defense in depth. It's cheap when the destination is a known
  // ATS host (one DNS lookup per request) and becomes load-bearing the moment the
  // generic engine (F8) starts navigating to arbitrary applyUrls.
  await installSsrfGuard(context);
  const page = await context.newPage();
  return { browser, context, page };
}

async function closeSession({ browser }) {
  try {
    await browser.close();
  } catch (err) {
    logger.warn(`browserSession: close failed — ${err.message}`);
  }
}

async function captureStorageState(context) {
  try {
    return await context.storageState();
  } catch (err) {
    logger.warn(`browserSession: storageState capture failed — ${err.message}`);
    return null;
  }
}

async function screenshotBuffer(page) {
  return page.screenshot({ type: 'jpeg', quality: 70 });
}

module.exports = { withRetry, launchSession, closeSession, captureStorageState, screenshotBuffer };

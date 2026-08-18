// createApplyBotWorker() — MUST be called only inside server.listen()'s callback,
// never at module scope (same rule as backend's aiWorker/schedulerWorker, reapplied
// at this service's own boundary: Railway's zero-downtime deploy overlap would
// otherwise create two workers processing the same queue).
const { Worker } = require('bullmq');
const axios = require('axios');
const { bullConnection } = require('./bullConnection');
const logger = require('./logger');
const backendApi = require('./services/backendApi');
const { uploadScreenshot } = require('./services/storageService');
const { resolveAdapter } = require('./adapters');
const { withRetry, launchSession, closeSession, captureStorageState, screenshotBuffer } = require('./engine/browserSession');
const { looksLikeLoginPage } = require('./engine/captchaDetector');

const LOW_CONFIDENCE_THRESHOLD = 60;

// TODO(F7): registry of currently-paused sessions, keyed by applyTaskId, so
// liveView.js can find the right Playwright `page` to screenshot/relay input into,
// and so a resolved-CAPTCHA signal from the live view can wake the corresponding
// paused task back up. Exported now (inert — nothing currently calls
// registerPausedSession) so F7 has a fixed place to plug into rather than
// inventing its own module-scope Map. When F7 is implemented, the CAPTCHA-detected
// branches below (currently: fail immediately) should call
// registerPausedSession(applyTaskId, session) and await a promise that
// clearPausedSession()/a 'mark-resolved' WS message resolves — see
// docs/apply-bot/TECHNICAL_PLAN.md F7 and Contract B for the exact shape.
const pausedSessions = new Map();

function registerPausedSession(applyTaskId, session) {
  pausedSessions.set(applyTaskId, session);
}

function getPausedSession(applyTaskId) {
  return pausedSessions.get(applyTaskId) || null;
}

function clearPausedSession(applyTaskId) {
  pausedSessions.delete(applyTaskId);
}

// Hard ceiling on a single task's wall-clock time. Individual Playwright calls
// already carry their own timeouts (goto: 30s, submit click: 10s, etc.), but there
// was no ceiling on the TASK as a whole — with concurrency: 1, a single hung page
// (a network call inside the browser that never resolves, an adapter awaiting a
// selector that's genuinely never coming) would block every other queued task
// indefinitely. This is the outer safety net, not a replacement for the per-call
// timeouts already in place.
const TASK_DEADLINE_MS = 3 * 60 * 1000;

async function downloadResumeBuffer(url) {
  if (!url) return null;
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(data);
  } catch (err) {
    logger.warn(`worker: resume download failed — ${err.message}`);
    return null;
  }
}

function classifyError(err) {
  const message = String(err?.message || err).toLowerCase();
  // Checked BEFORE the generic net::err case below: a request our own SSRF guard
  // aborted (ssrfGuard.js's route.abort('blockedbyclient')) surfaces to Playwright
  // as net::ERR_BLOCKED_BY_CLIENT — without this check it would be misclassified as
  // a generic NETWORK failure, which would corrupt F9's failure-class metrics (a
  // spike in "network problems" that's actually the security guard doing its job,
  // or — worth watching for — being too aggressive against a legitimate resource).
  if (message.includes('blocked_by_client') || message.includes('blockedbyclient')) return 'SSRF_BLOCKED';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('net::err') || message.includes('econnrefused') || message.includes('dns')) return 'NETWORK';
  if (message.includes('selector') || message.includes('element')) return 'PORTAL_LAYOUT';
  return 'UNKNOWN';
}

// The actual work — everything below is unchanged from before except that `ctx`
// (a plain mutable object) replaces the old top-level `const session`, so the
// deadline watchdog in processTask() can reach whatever session is currently open
// and force-close it if this function runs too long.
async function runTask(applyTaskId, ctx) {
  const task = await backendApi.claimTask(applyTaskId);
  const adapter = resolveAdapter(task.applyUrl);
  if (!adapter) {
    await backendApi.reportResult(applyTaskId, {
      status: 'failed', failureClass: 'UNKNOWN', failureReason: 'No adapter matched this applyUrl.',
    });
    return;
  }

  const resumeBuffer = await downloadResumeBuffer(task.applicant?.resumeDownloadUrl);
  const profile = { ...task.applicant, resumeBuffer, resumeFileName: task.applicant?.resumeFileName };

  const session = await launchSession(task.credential?.sessionState || null);
  ctx.session = session;
  const screenshotKeys = [];
  const captureStep = async (step) => {
    try {
      const buffer = await screenshotBuffer(session.page);
      const key = await uploadScreenshot(task.userId, applyTaskId, step, buffer);
      if (key) screenshotKeys.push(key);
    } catch (err) {
      logger.warn(`worker: screenshot capture failed (${step}) — ${err.message}`);
    }
  };

  try {
    await withRetry(() => session.page.goto(task.applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }));
    await captureStep('before-fill');

    const loginResult = await adapter.login(session.page, task.credential);

    // Catches a common, easy-to-miss failure mode: a reused sessionState that
    // expired sends us to a login page instead of the application form. Without
    // this check, fillApplication() would blindly try to match fields against a
    // login form and either abstain with a confusing LOW_CONFIDENCE reason or,
    // worse, partially fill the wrong fields — an explicit AUTH failure here is a
    // much clearer signal for someone reading the audit trail later.
    if (await looksLikeLoginPage(session.page)) {
      await captureStep('unexpected-login-page');
      await backendApi.reportResult(applyTaskId, {
        status: 'failed', failureClass: 'AUTH',
        failureReason: 'Landed on what looks like a login page after the login step — likely an expired/invalid stored session or credential.',
        screenshotKeys,
      });
      return;
    }

    const preFillCaptcha = await adapter.detectCaptcha(session.page);
    if (preFillCaptcha.detected) {
      await captureStep('captcha-detected');
      // Phase 1 has no live-view/pause UI yet — a detected CAPTCHA just fails the
      // task with the reason logged, rather than pausing (see plan §9, Phase 1 scope).
      await backendApi.reportResult(applyTaskId, {
        status: 'failed', failureClass: 'CAPTCHA',
        failureReason: `CAPTCHA detected before form fill (${preFillCaptcha.strategy}).`,
        screenshotKeys,
      });
      return;
    }

    const { fieldsFilled, confidence } = await adapter.fillApplication(session.page, profile);
    await captureStep('after-fill');

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      await backendApi.reportResult(applyTaskId, {
        status: 'skipped_low_confidence', failureClass: 'LOW_CONFIDENCE',
        failureReason: `Adapter confidence ${confidence} below threshold ${LOW_CONFIDENCE_THRESHOLD} — required fields (email/name/resume) could not be located with certainty.`,
        fieldsFilled, confidenceScore: confidence, screenshotKeys,
      });
      return;
    }

    const postFillCaptcha = await adapter.detectCaptcha(session.page);
    if (postFillCaptcha.detected) {
      await captureStep('captcha-after-fill');
      await backendApi.reportResult(applyTaskId, {
        status: 'failed', failureClass: 'CAPTCHA',
        failureReason: `CAPTCHA detected after form fill (${postFillCaptcha.strategy}).`,
        fieldsFilled, confidenceScore: confidence, screenshotKeys,
      });
      return;
    }

    if (task.mode !== 'live') {
      // Shadow mode: fill everything, stop one click before Submit.
      const result = {
        status: 'shadow_complete', fieldsFilled, confidenceScore: confidence, screenshotKeys,
      };
      if (loginResult?.attempted && task.credential) {
        result.sessionState = await captureStorageState(session.context);
      }
      await backendApi.reportResult(applyTaskId, result);
      return;
    }

    // Live mode — Phase 2 only in practice (APPLY_BOT_MODE defaults to shadow), but
    // implemented now since the adapter contract already supports it.
    const submitButton = adapter.locateSubmit(session.page);
    await submitButton.click({ timeout: 10000 }).catch((err) => {
      throw new Error(`submit click failed: ${err.message}`);
    });
    await session.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await captureStep('after-submit');

    const postSubmitCaptcha = await adapter.detectCaptcha(session.page);
    const result = postSubmitCaptcha.detected
      ? { status: 'failed', failureClass: 'CAPTCHA', failureReason: 'CAPTCHA detected after submit — outcome unknown.', fieldsFilled, confidenceScore: confidence, screenshotKeys }
      : { status: 'submitted', fieldsFilled, confidenceScore: confidence, screenshotKeys };
    if (loginResult?.attempted && task.credential) {
      result.sessionState = await captureStorageState(session.context);
    }
    await backendApi.reportResult(applyTaskId, result);
  } catch (err) {
    logger.error(`worker: task ${applyTaskId} failed — ${err.message}`);
    await backendApi
      .reportResult(applyTaskId, { status: 'failed', failureClass: classifyError(err), failureReason: err.message, screenshotKeys })
      .catch(() => {});
  } finally {
    await closeSession(session);
    ctx.session = null;
  }
}

// Wraps runTask() with the TASK_DEADLINE_MS ceiling described above. If runTask
// finishes first, the deadline timer is cleared and this is a no-op wrapper. If the
// deadline fires first, it force-closes whatever browser session runTask currently
// has open (via the shared `ctx`) and reports a TIMEOUT failure — freeing the
// concurrency:1 queue to move on. Note: in the rare case both fire close together,
// the task's final status may be written twice (harmless — same row, last write
// wins); not worth the extra complexity of a stricter mutex for how rarely the
// deadline should actually trigger.
async function processTask(applyTaskId) {
  const ctx = { session: null };
  let deadlineTimer;

  const deadline = new Promise((resolve) => {
    deadlineTimer = setTimeout(async () => {
      // TODO(F7 — REQUIRED, see docs/apply-bot/TECHNICAL_PLAN.md's "Reliability
      // Hardening" §7): this must NOT fire while the task is legitimately paused
      // for a human (getPausedSession(applyTaskId) is set) — check that here and
      // skip/reschedule with a separate, longer deadline instead of force-closing
      // a session a human may currently be looking at through the live view.
      logger.error(`worker: task ${applyTaskId} exceeded ${TASK_DEADLINE_MS}ms deadline — forcing close`);
      if (ctx.session) await closeSession(ctx.session).catch(() => {});
      await backendApi
        .reportResult(applyTaskId, {
          status: 'failed', failureClass: 'TIMEOUT',
          failureReason: `Task exceeded the ${TASK_DEADLINE_MS}ms overall deadline (likely a hung page or network call).`,
        })
        .catch(() => {});
      resolve();
    }, TASK_DEADLINE_MS);
  });

  await Promise.race([runTask(applyTaskId, ctx), deadline]);
  clearTimeout(deadlineTimer);
}

function createApplyBotWorker() {
  const worker = new Worker(
    'apply-bot-tasks',
    async (job) => processTask(job.data.applyTaskId),
    {
      connection: bullConnection(),
      concurrency: 1, // one browser session at a time — Phase 1 default
      // maxStalledCount: 0 — deliberately DISABLES BullMQ's normal "a stalled job
      // gets automatically re-run" behavior. That default exists to recover from a
      // worker crashing mid-job, but for this queue a crash could happen AFTER the
      // real ATS form was actually submitted and BEFORE reportResult() fired — an
      // automatic re-run would then risk a genuine duplicate application, which is
      // exactly the failure mode applyBotQueue.js's `attempts: 1` was already
      // designed to prevent. A crashed task instead sits at status: 'running' and is
      // caught by the stale-task sweep (backend/jobs/applyBotSweep.js) for a human
      // to check rather than being silently retried.
      maxStalledCount: 0,
    }
  );

  worker.on('completed', (job) => logger.info(`apply-bot: task ${job.data.applyTaskId} completed`));
  worker.on('failed', (job, err) => logger.error(`apply-bot: task ${job?.data?.applyTaskId} failed — ${err?.message}`));

  logger.info('apply-bot worker started (apply-bot-tasks, concurrency 1).');
  return worker;
}

module.exports = { createApplyBotWorker, getPausedSession, registerPausedSession, clearPausedSession };

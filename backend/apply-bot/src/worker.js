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
const { looksLikeLoginPage, detectEmailVerification } = require('./engine/captchaDetector');

const LOW_CONFIDENCE_THRESHOLD = 60;

// Registry of currently-paused sessions, keyed by applyTaskId, so liveView.js can
// find the right Playwright `page` to screenshot/relay input into, and so a
// 'mark-resolved' WS message can wake the corresponding paused task back up. Each
// entry also carries the `resolve` function for that task's pending pause promise
// (see waitForHumanResolution below) — liveView.js calls it, not just clears the
// registry, or the paused task would time out instead of actually resuming.
const pausedSessions = new Map();

function registerPausedSession(applyTaskId, session, resolve) {
  pausedSessions.set(applyTaskId, { session, resolve });
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
// TASK_DEADLINE_MS_OVERRIDE (added 2026-08-19, F3 verification session): lets a
// real 3-minute wait be replaced with seconds when testing this specific mechanism
// (see docs/apply-bot/TEST_PLAN.md F3) without touching production behavior —
// unset in every real deployment, where this is always exactly 3 minutes.
const TASK_DEADLINE_MS = process.env.TASK_DEADLINE_MS_OVERRIDE
  ? parseInt(process.env.TASK_DEADLINE_MS_OVERRIDE, 10)
  : 3 * 60 * 1000;

// How long a paused_human task waits for a real person to solve the challenge via
// the live view before giving up. Deliberately much longer than TASK_DEADLINE_MS —
// see docs/apply-bot/TECHNICAL_PLAN.md F7 (10 minutes for an unsolved CAPTCHA).
// PAUSE_TIMEOUT_MS_OVERRIDE (F7 verification): same testability pattern as
// TASK_DEADLINE_MS_OVERRIDE above — unset in every real deployment.
const PAUSE_TIMEOUT_MS = process.env.PAUSE_TIMEOUT_MS_OVERRIDE
  ? parseInt(process.env.PAUSE_TIMEOUT_MS_OVERRIDE, 10)
  : 10 * 60 * 1000;

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

// Checks for either kind of human-hand-off challenge this project knows about.
// CAPTCHA takes priority when (implausibly) both fire at once — arbitrary but
// deterministic, and CAPTCHA is by far the more common real case (see F4/F5/F6).
async function checkChallenge(page, adapter) {
  const captcha = await adapter.detectCaptcha(page);
  if (captcha.detected) return { pauseReason: 'captcha', failureClass: 'CAPTCHA', detail: captcha };
  const emailVerify = await detectEmailVerification(page);
  if (emailVerify.detected) return { pauseReason: 'email_verification', failureClass: 'EMAIL_VERIFICATION', detail: emailVerify };
  return null;
}

// Reports the pause to the backend, registers the session so liveView.js can find
// it, and waits for either a human to resolve it (via the WS 'mark-resolved'
// message — see liveView.js) or PAUSE_TIMEOUT_MS to elapse. `ctx.paused` is set/
// cleared around the wait so processTask()'s outer deadline (below) knows not to
// count this time against the normal 3-minute budget — see that function's own
// comment for why this is required, not optional.
async function waitForHumanResolution(applyTaskId, session, pauseReason, ctx) {
  ctx.paused = true;
  await backendApi.reportResult(applyTaskId, { status: 'paused_human', pauseReason }).catch((err) => {
    logger.warn(`worker: failed to report paused_human for ${applyTaskId} — ${err.message}`);
  });

  const resolvedByHuman = await new Promise((resolve) => {
    let timer;
    registerPausedSession(applyTaskId, session, () => {
      clearTimeout(timer);
      resolve(true);
    });
    timer = setTimeout(() => resolve(false), PAUSE_TIMEOUT_MS);
  });

  clearPausedSession(applyTaskId); // no-op if liveView.js's mark-resolved already cleared it
  ctx.paused = false;
  return resolvedByHuman;
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

  // Handles a detected challenge at any checkpoint. LIVE mode pauses for a human
  // via the live view (the original behavior); on failure to resolve, reports the
  // terminal failure and returns `proceed: false` so the caller knows to stop.
  //
  // SHADOW mode does NOT pause — same bug shape as F4/F5/F6's worker.js and F2's
  // internal.js: a side-effecting branch missing a task.mode check, found and fixed
  // during F7's own session, carried forward here since this branch predates that
  // fix (see MEMORY.md's F7/F8 entries). More severe than the F4-F6 instance:
  // with `concurrency: 1`, a single paused task blocks the ENTIRE queue behind it
  // for up to PAUSE_TIMEOUT_MS (10 minutes), and CAPTCHA is confirmed present on
  // ~100% of real Lever/Greenhouse postings — so an unmodified pause-on-every-
  // challenge would turn shadow mode's unattended daily batch into something that
  // can only progress with a human solving CAPTCHAs serially, one task at a time.
  // Live mode's pause is unchanged and correct (a real submission genuinely can't
  // proceed past an unsolved challenge).
  const handleChallenge = async (challenge, stepLabel) => {
    await captureStep(stepLabel);

    if (task.mode !== 'live') {
      return { proceed: true, challenge };
    }

    const resolved = await waitForHumanResolution(applyTaskId, session, challenge.pauseReason, ctx);
    if (!resolved) {
      await backendApi.reportResult(applyTaskId, {
        status: 'failed', failureClass: challenge.failureClass,
        failureReason: `Unsolved ${challenge.pauseReason} challenge — timed out after ${PAUSE_TIMEOUT_MS / 60000} minutes with no human response.`,
        screenshotKeys,
      });
      return { proceed: false };
    }
    // Re-check rather than blindly trusting the human's "I solved it" signal —
    // the same page is still open, so this is cheap and catches a premature click.
    const stillPresent = await checkChallenge(session.page, adapter);
    if (stillPresent) {
      await backendApi.reportResult(applyTaskId, {
        status: 'failed', failureClass: stillPresent.failureClass,
        failureReason: `${stillPresent.pauseReason} challenge still present after being marked resolved.`,
        screenshotKeys,
      });
      return { proceed: false };
    }
    return { proceed: true };
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

    const preFillChallenge = await checkChallenge(session.page, adapter);
    let preFillChallengeInfo = null;
    if (preFillChallenge) {
      const outcome = await handleChallenge(preFillChallenge, 'captcha-detected');
      if (!outcome.proceed) return;
      if (outcome.challenge) preFillChallengeInfo = outcome.challenge;
    }

    const { fieldsFilled, confidence } = await adapter.fillApplication(session.page, profile);
    await captureStep('after-fill');
    // Shadow-mode-only metadata (see handleChallenge's comment above) — carried in
    // fieldsFilled (already free-form JSON) rather than a new top-level result key,
    // since internal.js's callback schema is .strict().
    if (preFillChallengeInfo) {
      fieldsFilled._challengeDetectedPreFill = { pauseReason: preFillChallengeInfo.pauseReason };
    }

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      await backendApi.reportResult(applyTaskId, {
        status: 'skipped_low_confidence', failureClass: 'LOW_CONFIDENCE',
        failureReason: `Adapter confidence ${confidence} below threshold ${LOW_CONFIDENCE_THRESHOLD} — required fields (email/name/resume) could not be located with certainty.`,
        fieldsFilled, confidenceScore: confidence, screenshotKeys,
      });
      return;
    }

    const postFillChallenge = await checkChallenge(session.page, adapter);
    if (postFillChallenge) {
      const outcome = await handleChallenge(postFillChallenge, 'captcha-after-fill');
      if (!outcome.proceed) return;
      if (outcome.challenge) fieldsFilled._challengeDetectedPostFill = { pauseReason: outcome.challenge.pauseReason };
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
    // Awaited so genericAdapter.js's async locateSubmit() (needs a real .count()
    // check to pick the right submit-button pattern — see that file's 2026-08-20
    // comment) works correctly. Harmless for the other adapters' synchronous
    // locateSubmit: a plain Playwright Locator is not thenable, so awaiting one
    // just returns it unchanged.
    const submitButton = await adapter.locateSubmit(session.page);
    await submitButton.click({ timeout: 10000 }).catch((err) => {
      throw new Error(`submit click failed: ${err.message}`);
    });
    await session.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await captureStep('after-submit');

    const postSubmitChallenge = await checkChallenge(session.page, adapter);
    const result = postSubmitChallenge
      ? { status: 'failed', failureClass: postSubmitChallenge.failureClass, failureReason: `${postSubmitChallenge.pauseReason} challenge detected after submit — outcome unknown.`, fieldsFilled, confidenceScore: confidence, screenshotKeys }
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
    clearPausedSession(applyTaskId); // defensive — should already be cleared, never leave a stale registry entry
    await closeSession(session);
    ctx.session = null;
  }
}

// Wraps runTask() with the TASK_DEADLINE_MS ceiling described above. If runTask
// finishes first, the deadline is cleared and this is a no-op wrapper. If it fires
// first, it force-closes whatever browser session runTask currently has open (via
// the shared `ctx`) and reports a TIMEOUT failure — freeing the concurrency:1
// queue to move on. Note: in the rare case both fire close together, the task's
// final status may be written twice (harmless — same row, last write wins); not
// worth the extra complexity of a stricter mutex for how rarely this should race.
//
// **Pause-aware, per F7's required design point** (docs/apply-bot/TECHNICAL_PLAN.md
// "Reliability Hardening" §7): the naive single-setTimeout version of this deadline
// would fire mid-pause and force-close a session a human may be actively looking at
// through the live view — a real bug, not a hypothetical one, the moment
// waitForHumanResolution() above can legitimately keep a task "in progress" for up
// to 10 minutes. Implemented as a 1-second polling tick instead of one fixed timer:
// each tick, if `ctx.paused` is true, the tick just reschedules itself without
// counting against the deadline at all (the pause has its OWN timeout, enforced
// inside waitForHumanResolution — this loop doesn't need to duplicate that). Once
// unpaused, elapsed wall-clock time excludes whatever was spent paused, so the task
// gets its full, un-shortened TASK_DEADLINE_MS budget for the actual work.
async function processTask(applyTaskId) {
  const ctx = { session: null, paused: false };
  const startedAt = Date.now();
  let pausedSince = null;
  let totalPausedMs = 0;
  let settled = false;
  let tickTimer;

  const tick = async () => {
    if (settled) return;

    if (ctx.paused) {
      if (pausedSince === null) pausedSince = Date.now();
      tickTimer = setTimeout(tick, 1000);
      return;
    }
    if (pausedSince !== null) {
      totalPausedMs += Date.now() - pausedSince;
      pausedSince = null;
    }

    const elapsed = Date.now() - startedAt - totalPausedMs;
    if (elapsed < TASK_DEADLINE_MS) {
      tickTimer = setTimeout(tick, Math.min(1000, TASK_DEADLINE_MS - elapsed));
      return;
    }

    settled = true;
    logger.error(`worker: task ${applyTaskId} exceeded ${TASK_DEADLINE_MS}ms deadline (excluding paused time) — forcing close`);
    clearPausedSession(applyTaskId);
    if (ctx.session) await closeSession(ctx.session).catch(() => {});
    await backendApi
      .reportResult(applyTaskId, {
        status: 'failed', failureClass: 'TIMEOUT',
        failureReason: `Task exceeded the ${TASK_DEADLINE_MS}ms overall deadline, excluding any time spent legitimately paused for a human (likely a hung page or network call).`,
      })
      .catch(() => {});
  };
  tickTimer = setTimeout(tick, 1000);

  await runTask(applyTaskId, ctx);
  settled = true;
  clearTimeout(tickTimer);
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

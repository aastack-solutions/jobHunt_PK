// F7 code-review regression test: worker.js's handleChallenge() used to pause for
// a human (waitForHumanResolution) on ANY detected CAPTCHA/challenge, regardless
// of task.mode. That's the correct behavior for live mode (a real submission
// genuinely can't proceed past an unsolved CAPTCHA), but shadow mode never
// submits anything — there is nothing a human solving the challenge would unblock.
// Combined with the worker's `concurrency: 1`, an unmodified pause-on-every-
// challenge would have meant a single paused SHADOW task blocks the entire queue
// behind it for up to PAUSE_TIMEOUT_MS (10 minutes) — and F4/F5 already confirmed
// CAPTCHA present on ~100% of real Lever/Greenhouse postings, so shadow mode's
// supposed-to-be-unattended daily batch (20-30 tasks/user) could only make
// progress with a human live at the console solving CAPTCHAs serially. Same
// "task.mode check missing before a side-effecting branch" bug shape as F2's
// internal.js fix and F4/F5/F6's own worker.js fix — see MEMORY.md's 2026-08-20 F7
// entry for the full writeup, including how this was proven with two standalone
// scripts (shadow mode completing in ~1.7s vs. live mode genuinely pausing) before
// being turned into this permanent test.
//
// Uses hCaptcha's own stable public demo page (https://accounts.hcaptcha.com/demo)
// rather than a real job posting — job postings close/change and this needs a
// reliable, always-present CAPTCHA widget to trigger checkChallenge(), not
// something subject to the churn F5/F6's sessions both hit. Requires network
// reachability to that page; skips (not fails) if it's unreachable so this doesn't
// break `npm test` in a fully offline environment.
//
// worker.js transitively requires 'playwright' (via engine/browserSession.js) at
// module scope, so — same pattern as the other Playwright-dependent tests in this
// directory — everything is required lazily inside each test body.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const HCAPTCHA_DEMO_URL = 'https://accounts.hcaptcha.com/demo';

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

async function hcaptchaDemoReachable() {
  try {
    const res = await fetch(HCAPTCHA_DEMO_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function fakeTask(mode) {
  return {
    id: `fake-task-${mode}`,
    userId: 'fake-user-id',
    applyUrl: HCAPTCHA_DEMO_URL,
    adapterUsed: 'generic',
    mode,
    job: null,
    credential: null,
    applicant: { fullName: 'Jamie Rivera', email: 'jamie@example.com', resumeFileName: null, resumeDownloadUrl: null, skills: [] },
  };
}

test('worker.runTask: shadow mode does NOT pause on a detected CAPTCHA — completes fast and records it as metadata', async (t) => {
  if (!playwrightAvailable()) {
    t.skip('requires Playwright to be installed — worker.js transitively requires it via browserSession.js');
    return;
  }
  if (!(await hcaptchaDemoReachable())) {
    t.skip('requires network reachability to accounts.hcaptcha.com — not reachable from this environment');
    return;
  }

  const backendApi = require('../src/services/backendApi');
  const originalClaimTask = backendApi.claimTask;
  const originalReportResult = backendApi.reportResult;
  const reportedResults = [];
  backendApi.claimTask = async () => fakeTask('shadow');
  backendApi.reportResult = async (taskId, result) => {
    reportedResults.push(result);
  };

  try {
    const { runTask } = require('../src/worker');
    const startedAt = Date.now();
    await runTask('fake-task-shadow', { session: null, paused: false });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 30000, `expected shadow mode to complete quickly (no 10-minute pause); took ${elapsedMs}ms`);
    assert.ok(
      !reportedResults.some((r) => r.status === 'paused_human'),
      'shadow mode must never report paused_human — that would mean it tried to pause'
    );
    assert.ok(
      reportedResults.some(
        (r) => r.fieldsFilled && (r.fieldsFilled._challengeDetectedPreFill || r.fieldsFilled._challengeDetectedPostFill)
      ),
      'the detected challenge must still be recorded as metadata in fieldsFilled'
    );
  } finally {
    backendApi.claimTask = originalClaimTask;
    backendApi.reportResult = originalReportResult;
  }
});

test('worker.runTask: live mode DOES pause on a detected CAPTCHA, then fails as CAPTCHA if never resolved', async (t) => {
  if (!playwrightAvailable()) {
    t.skip('requires Playwright to be installed — worker.js transitively requires it via browserSession.js');
    return;
  }
  if (!(await hcaptchaDemoReachable())) {
    t.skip('requires network reachability to accounts.hcaptcha.com — not reachable from this environment');
    return;
  }

  const originalOverride = process.env.PAUSE_TIMEOUT_MS_OVERRIDE;
  process.env.PAUSE_TIMEOUT_MS_OVERRIDE = '3000'; // real 10-minute wait would make this test unusable

  // worker.js reads PAUSE_TIMEOUT_MS_OVERRIDE once at module-load time, so it must
  // be set BEFORE the first require of ../src/worker in this process. This test
  // file is the only one in the suite that needs a non-default value, so it's set
  // here rather than globally — if worker.js was already required by an earlier
  // test in the same run, delete its module cache entry first so this test's
  // override actually takes effect.
  delete require.cache[require.resolve('../src/worker')];

  const backendApi = require('../src/services/backendApi');
  const originalClaimTask = backendApi.claimTask;
  const originalReportResult = backendApi.reportResult;
  const reportedResults = [];
  backendApi.claimTask = async () => fakeTask('live');
  backendApi.reportResult = async (taskId, result) => {
    reportedResults.push(result);
  };

  try {
    const { runTask } = require('../src/worker');
    const startedAt = Date.now();
    await runTask('fake-task-live', { session: null, paused: false });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(
      reportedResults.some((r) => r.status === 'paused_human' && r.pauseReason === 'captcha'),
      'live mode must report paused_human with pauseReason captcha'
    );
    assert.ok(
      reportedResults.some((r) => r.status === 'failed' && r.failureClass === 'CAPTCHA' && /timed out/.test(r.failureReason || '')),
      'live mode must fail with CAPTCHA/timed-out once the (overridden, short) pause window elapses unresolved'
    );
    assert.ok(elapsedMs >= 3000, `expected the pause to actually wait out its timeout (>=3000ms); took ${elapsedMs}ms`);
  } finally {
    backendApi.claimTask = originalClaimTask;
    backendApi.reportResult = originalReportResult;
    if (originalOverride === undefined) delete process.env.PAUSE_TIMEOUT_MS_OVERRIDE;
    else process.env.PAUSE_TIMEOUT_MS_OVERRIDE = originalOverride;
    delete require.cache[require.resolve('../src/worker')];
  }
});

// /api/internal/* — cron-triggered internal endpoints, guarded by CRON_SECRET.
// The external backup scheduler (and local manual testing) hit trigger-fetch to
// run the daily fetch on demand without waiting for the 05:00 UTC repeatable job.
//
// The /apply-bot/* endpoints below are guarded by a SEPARATE secret (APPLY_BOT_SECRET)
// since they're called by the apply-bot service (a distinct Railway deployment with no
// public networking of its own), not by the external cron trigger.
const express = require('express');
const { z } = require('zod');
const logger = require('../logger');
const prisma = require('../db');
const cryptoService = require('../services/cryptoService');
const { getDownloadUrl, isConfigured } = require('../services/storageService');
const { runDailyJobFetch } = require('../../jobs/dailyJobFetch');
const { runApplyBotSelection } = require('../../jobs/applyBotSelect');
const { sweepStaleApplyTasks } = require('../../jobs/applyBotSweep');

const router = express.Router();

// Guards internal endpoints with the CRON secret header. Constant-time comparison
// (see cryptoService.timingSafeEqualString) — a naive !== comparison is vulnerable
// to a timing side-channel that can leak the secret one byte at a time.
function requireCronSecret(req, res, next) {
  const provided = req.get('X-Cron-Secret');
  if (!process.env.CRON_SECRET || !cryptoService.timingSafeEqualString(provided, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

// Guards endpoints only the apply-bot service should call. Same constant-time
// comparison rationale as requireCronSecret above.
function requireApplyBotSecret(req, res, next) {
  const provided = req.get('X-Apply-Bot-Secret');
  if (!process.env.APPLY_BOT_SECRET || !cryptoService.timingSafeEqualString(provided, process.env.APPLY_BOT_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

router.post('/trigger-fetch', requireCronSecret, async (req, res) => {
  logger.info('internal: trigger-fetch invoked');
  const result = await runDailyJobFetch();
  return res.json({ ok: true, ...result });
});

// Phase 1: manual trigger only — not yet wired into the daily scheduler.
// runApplyBotSelection() already runs the stale-task sweep internally (see
// applyBotSelect.js) — this endpoint runs selection AND the sweep together, as it
// will once scheduled.
router.post('/apply-bot/trigger-select', requireCronSecret, async (req, res) => {
  logger.info('internal: apply-bot trigger-select invoked');
  const result = await runApplyBotSelection();
  return res.json({ ok: true, ...result });
});

// Separate manual trigger for JUST the sweep (applyBotSweep.js) — useful for testing
// the stale-task cleanup in isolation, without needing real JobMatch/credential data
// that full selection requires.
router.post('/apply-bot/trigger-sweep', requireCronSecret, async (req, res) => {
  logger.info('internal: apply-bot trigger-sweep invoked');
  const result = await sweepStaleApplyTasks();
  return res.json({ ok: true, ...result });
});

// Worker claims a queued task: marks it running, hands back everything it needs to
// execute — including the DECRYPTED credential (and any saved session state) so the
// apply-bot process never needs APPLY_BOT_MASTER_KEY or direct DB access itself.
router.get('/apply-bot/tasks/:id', requireApplyBotSecret, async (req, res) => {
  const task = await prisma.applyTask.findUnique({
    where: { id: req.params.id },
    include: { job: true },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let credential = null;
  if (task.adapterUsed !== 'generic') {
    const cred = await prisma.applyCredential.findUnique({
      where: { userId_platform: { userId: task.userId, platform: task.adapterUsed } },
    });
    if (cred && cred.isActive) {
      const { username, password } = cryptoService.decryptJSON({
        ciphertext: cred.credentialEncrypted,
        iv: cred.iv,
        authTag: cred.authTag,
      });
      const sessionState = cred.sessionStateEncrypted
        ? cryptoService.decryptJSON({
            ciphertext: cred.sessionStateEncrypted,
            iv: cred.sessionStateIv,
            authTag: cred.sessionStateAuthTag,
          })
        : null;
      credential = { username, password, sessionState };
    }
  }

  const [user, resume] = await Promise.all([
    prisma.user.findUnique({ where: { id: task.userId } }),
    prisma.resume.findFirst({ where: { userId: task.userId, isActive: true }, orderBy: { uploadedAt: 'desc' } }),
  ]);
  const resumeDownloadUrl =
    resume && isConfigured() ? await getDownloadUrl(resume.fileKey).catch(() => null) : null;

  await prisma.applyTask.update({
    where: { id: task.id },
    data: { status: 'running', startedAt: new Date() },
  });

  return res.json({
    id: task.id,
    userId: task.userId,
    applyUrl: task.applyUrl,
    adapterUsed: task.adapterUsed,
    mode: task.mode,
    job: task.job ? { title: task.job.title, company: task.job.company, description: task.job.description } : null,
    credential,
    // Phone/LinkedIn/portfolio aren't collected anywhere in the schema yet — adapters
    // will report those fields as unfillable rather than guess. Adding them is a
    // schema change like the others in this feature, left for explicit sign-off.
    applicant: user
      ? {
          fullName: user.fullName,
          email: user.email,
          resumeFileName: resume?.fileName || null,
          resumeDownloadUrl,
          skills: resume?.skills || [],
        }
      : null,
  });
});

const callbackSchema = z
  .object({
    status: z.enum([
      'paused_human', 'shadow_complete', 'submitted', 'failed',
      'skipped_low_confidence', 'skipped_duplicate', 'skipped_cap_reached',
    ]),
    // Required alongside status: 'paused_human' — which kind of human hand-off this
    // is (F7's Contract B — the live-view frontend shows different instructions per
    // reason). Validated together below, not in the object shape, since Zod's
    // .refine() on a .strict() object is simpler than a discriminated union here.
    pauseReason: z.enum(['captcha', 'email_verification', 'unknown_challenge']).optional(),
    // SSRF_BLOCKED = our own ssrfGuard.js aborted a request — see worker.js's
    // classifyError(); kept distinct from NETWORK so it's never misread as an infra
    // problem in the F9 failure-class metrics. EMAIL_VERIFICATION kept distinct from
    // CAPTCHA for the same reason — an unsolved email-verification challenge is a
    // different failure mode, not a CAPTCHA that happened to time out.
    failureClass: z.enum(['CAPTCHA', 'EMAIL_VERIFICATION', 'AUTH', 'TIMEOUT', 'PORTAL_LAYOUT', 'NETWORK', 'LOW_CONFIDENCE', 'SSRF_BLOCKED', 'UNKNOWN']).optional(),
    failureReason: z.string().max(2000).optional(),
    fieldsFilled: z.record(z.string(), z.any()).optional(),
    confidenceScore: z.number().int().min(0).max(100).optional(),
    screenshotKeys: z.array(z.string()).optional(),
    // Base64 storageState to persist for reuse on future tasks (only sent after a
    // fresh login succeeded) — encrypted here before it ever touches the DB.
    sessionState: z.record(z.string(), z.any()).optional(),
  })
  .strict()
  .refine((data) => data.status !== 'paused_human' || Boolean(data.pauseReason), {
    message: 'pauseReason is required when status is paused_human',
    path: ['pauseReason'],
  });

// Once a task reaches one of these, no later callback may change it. Without this
// guard, a retried POST (backendApi.js's withRetry fires after a dropped response —
// the work already succeeded, only the HTTP response was lost) would re-run the
// state-changing logic below: a duplicate 'submitted' callback would create a
// SECOND Application row for the same job, and a stale 'failed' retry arriving late
// could downgrade a real success into a false failure — the exact scenario that
// makes retrying reportResult() safe or unsafe. 'paused_human'/'running'/'queued'
// are deliberately excluded so real progressions (e.g. paused_human → submitted)
// still work. 'unknown_outcome' (set only by applyBotSweep.js, never by a worker
// callback — see that file) is included here too: no legitimate callback should
// ever target a task in that state, so protecting it from casual overwrite is
// pure upside.
const TERMINAL_STATUSES = new Set([
  'submitted', 'shadow_complete', 'failed', 'unknown_outcome',
  'skipped_low_confidence', 'skipped_duplicate', 'skipped_cap_reached',
]);

router.post('/apply-bot/tasks/:id/callback', requireApplyBotSecret, async (req, res) => {
  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { status, pauseReason, failureClass, failureReason, fieldsFilled, confidenceScore, screenshotKeys, sessionState } = parsed.data;

  const task = await prisma.applyTask.findUnique({ where: { id: req.params.id }, include: { job: true } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (TERMINAL_STATUSES.has(task.status)) {
    logger.info(`internal: apply-bot callback for already-terminal task ${task.id} (${task.status}) — ignoring as a duplicate`);
    return res.json({ ok: true, alreadyTerminal: true, status: task.status });
  }

  const isPaused = status === 'paused_human';
  await prisma.applyTask.update({
    where: { id: task.id },
    data: {
      status,
      pauseReason: isPaused ? pauseReason : null,
      failureClass: failureClass || null,
      failureReason: failureReason || null,
      fieldsFilled: fieldsFilled || undefined,
      confidenceScore: confidenceScore ?? undefined,
      screenshotKeys: screenshotKeys || undefined,
      captchaDetectedAt: status === 'paused_human' ? new Date() : undefined,
      captchaSolvedAt: task.status === 'paused_human' && !isPaused ? new Date() : undefined,
      completedAt: isPaused ? undefined : new Date(),
    },
  });

  // A real submission (live mode only) creates the Application record — the only
  // place the bot creates one; the existing manual POST /api/applications is untouched.
  //
  // Explicit task.mode === 'live' check added 2026-08-20 (code review, same fix
  // carried across F2/F7/F8 — see MEMORY.md): the comment above already said "live
  // mode only" but the code never actually checked task.mode, only task.job. Under
  // the current worker.js, shadow mode never reports status: 'submitted' (only
  // 'shadow_complete'), so this wasn't actively triggering — but it's the same
  // class of defect found and fixed multiple times elsewhere, closed here too as
  // defense-in-depth.
  if (status === 'submitted' && task.mode !== 'live') {
    logger.warn(
      `internal: apply-bot task ${task.id} reported 'submitted' but mode is '${task.mode}', not 'live' — this should never happen; skipping Application creation`
    );
  }
  if (status === 'submitted' && task.mode === 'live' && task.job) {
    // Whichever resume was active at submission time — re-queried here rather than
    // threaded through from claim time, since that's the more correct semantic
    // ("the resume active when this Application was created") and avoids plumbing
    // a resumeId through the worker/adapter contract for a multi-minute-old value.
    const resume = await prisma.resume.findFirst({
      where: { userId: task.userId, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });

    const application = await prisma.application.create({
      data: {
        userId: task.userId,
        jobId: task.job.id,
        jobTitle: task.job.title,
        company: task.job.company,
        locationType: task.job.locationType,
        status: 'applied',
        // The posting a human would open, NOT task.applyUrl -- since F8a those can
        // differ: for an employer-hosted Greenhouse board the task navigates to the
        // bare embed form, which is a poor link to show someone reviewing where they
        // applied. Falls back to the task's URL when the job row is somehow absent.
        applyUrl: task.job.applyUrl || task.applyUrl,
        source: 'auto_apply_bot',
        resumeId: resume?.id || null,
      },
    });
    // Backfills ApplyTask.applicationId — this field existed in the schema from
    // the start for exactly this link but was never actually written until now
    // (see docs/apply-bot/TECHNICAL_PLAN.md F13): without it there was no way to
    // go from an Application row back to its full bot audit trail (screenshots,
    // fieldsFilled, confidence score) except an indirect jobId/userId/time match.
    await prisma.applyTask.update({ where: { id: task.id }, data: { applicationId: application.id } });
  }

  if (sessionState) {
    const { ciphertext, iv, authTag } = cryptoService.encryptJSON(sessionState);
    await prisma.applyCredential
      .updateMany({
        where: { userId: task.userId, platform: task.adapterUsed },
        data: {
          sessionStateEncrypted: ciphertext,
          sessionStateIv: iv,
          sessionStateAuthTag: authTag,
          sessionStateSavedAt: new Date(),
        },
      })
      .catch(() => {});
  }

  return res.json({ ok: true });
});

module.exports = router;

// jobs/applyBotSweep.js — sweepStaleApplyTasks(): catches ApplyTask rows stuck in a
// non-terminal status for too long.
//
// Why this exists on top of worker.js's TASK_DEADLINE_MS: that deadline lives
// INSIDE the apply-bot worker process — it protects against a single task hanging
// while the process itself stays alive. It cannot protect against the whole process
// dying (SIGKILL, OOM, an unhandled crash before graceful shutdown can run) — the
// deadline timer dies with the process, and the task is left at 'running' forever
// with no report ever sent to the backend. This sweep is a separate, out-of-process
// check that doesn't depend on the crashed process to clean up after itself.
//
// Also load-bearing for correctness, not just tidiness: applyBotSelect.js's dedupe
// logic treats 'running' and 'paused_human' as "in flight" so it never creates a
// second task for the same job — a permanently-stuck row would silently block that
// job from ever being retried for that user, forever.
const prisma = require('../src/db');
const logger = require('../src/logger');

// Generous relative to worker.js's TASK_DEADLINE_MS (3 min) — if a task is still
// 'running' after 10 minutes, the in-process deadline should already have fired (and
// reported failed/TIMEOUT) if the process were still alive; this margin is there so
// the sweep doesn't race a legitimately-finishing task, not because 10 minutes is
// the expected duration.
const RUNNING_STALE_MS = 10 * 60 * 1000;

// 'paused_human' (F7) is bound by how long a human takes to notice and solve a
// challenge, not by anything the worker controls — a much longer threshold is
// appropriate here than RUNNING_STALE_MS above. This sweep's PAUSED_STALE_MS is an
// OUTER, out-of-process safety net distinct from worker.js's own in-process
// PAUSE_TIMEOUT_MS (10 min, checked while the process is still alive) — this one
// catches the case the in-process timer can't: the whole apply-bot process dying
// while a task sits paused, which would otherwise leave it paused forever with no
// one ever timing it out.
const PAUSED_STALE_MS = 30 * 60 * 1000;

async function sweepStaleApplyTasks() {
  const now = Date.now();

  // Deliberately NOT marked 'failed'. A task stuck at 'running' this long means the
  // whole apply-bot process died (see file header) — but it could have died AFTER
  // successfully submitting the real ATS form and BEFORE reporting that back. Status
  // 'failed' would make applyBotSelect.js's dedupe treat the job as retry-eligible
  // tomorrow, risking a genuine duplicate application if it actually went through.
  // 'unknown_outcome' is excluded from auto-retry (see applyBotSelect.js) — a human
  // has to check (application history, confirmation email) and resolve it manually.
  const staleRunning = await prisma.applyTask.updateMany({
    where: { status: 'running', startedAt: { lt: new Date(now - RUNNING_STALE_MS) } },
    data: {
      status: 'unknown_outcome',
      failureReason: `Task was still 'running' after ${RUNNING_STALE_MS / 60000} minutes with no result reported — the apply-bot process likely crashed or was killed mid-task. Outcome on the actual ATS site is UNCONFIRMED — check manually (application history / confirmation email) before assuming it did or didn't submit. This job will NOT be auto-retried until this task is manually resolved.`,
      completedAt: new Date(),
    },
  });

  // Fetched individually (not updateMany) so each row's failureClass can reflect
  // its own pauseReason rather than hardcoding 'CAPTCHA' for every kind of pause.
  const stalePausedTasks = await prisma.applyTask.findMany({
    where: { status: 'paused_human', captchaDetectedAt: { lt: new Date(now - PAUSED_STALE_MS) } },
    select: { id: true, pauseReason: true },
  });
  for (const t of stalePausedTasks) {
    await prisma.applyTask.update({
      where: { id: t.id },
      data: {
        status: 'failed',
        failureClass: t.pauseReason === 'email_verification' ? 'EMAIL_VERIFICATION' : 'CAPTCHA',
        failureReason: `Task was paused (${t.pauseReason || 'unknown reason'}) for over ${PAUSED_STALE_MS / 60000} minutes with no human response — timed out. This is the out-of-process safety net (see PAUSED_STALE_MS's comment); the apply-bot process may have crashed while this task was paused.`,
        completedAt: new Date(),
      },
    });
  }
  const stalePaused = { count: stalePausedTasks.length };

  if (staleRunning.count > 0 || stalePaused.count > 0) {
    logger.warn(`apply-bot-sweep: swept ${staleRunning.count} stale 'running' + ${stalePaused.count} stale 'paused_human' task(s)`);
  }
  return { staleRunning: staleRunning.count, stalePaused: stalePaused.count };
}

module.exports = { sweepStaleApplyTasks, RUNNING_STALE_MS, PAUSED_STALE_MS };

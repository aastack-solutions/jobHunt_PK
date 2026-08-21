// workers/schedulerWorker.js — createSchedulerWorker() is called ONLY inside
// server.listen() (never at import time), so Railway's zero-downtime deploy can
// never start two workers on the same queue.
//
// Week 3 registers daily-job-fetch (05:00 UTC). Later weeks add exchange-rate-fetch
// (04:45), interview-reminders (08:00), and weekly-cleanup (Sun 03:00).
//
// apply-bot-select (05:15 UTC, F12) added 2026-08-21 — this was the one concrete,
// code-buildable gap in F12's own checklist (docs/apply-bot/TECHNICAL_PLAN.md):
// "Phase 1 only ever manually triggers applyBotSelect.js; wiring the real schedule
// ... is a concrete, easy-to-forget implementation step in its own right." 05:15,
// a few minutes after daily-job-fetch (05:00), matches the original plan so
// selection reads a fully up-to-date JobMatch table. runApplyBotSelection() already
// sweeps stale tasks (applyBotSweep.js) and runs the failure report at the start of
// every call, so this one registration covers both — no separate sweep job needed.
const { Worker } = require('bullmq');
const logger = require('../logger');
const schedulerQueue = require('../queues/schedulerQueue');
const { bullConnection } = require('../queues/bullConnection');
const { runDailyJobFetch } = require('../../jobs/dailyJobFetch');
const { runExchangeRateFetch } = require('../../jobs/exchangeRateFetch');
const { runInterviewReminders } = require('../../jobs/interviewReminders');
const { runApplyBotSelection } = require('../../jobs/applyBotSelect');

// Register repeatable jobs. Never purge existing ones — BullMQ dedupes by jobId,
// so re-adding on every boot is safe and avoids missed runs near a scheduled time.
async function registerRepeatableJobs() {
  // Exchange rate at 04:45 (before the 05:00 fetch), with retries so the rate is
  // cached in time for salary scoring.
  await schedulerQueue.add(
    'exchange-rate-fetch',
    {},
    {
      repeat: { pattern: '45 4 * * *', tz: 'UTC' },
      jobId: 'exchange-rate-fetch',
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    }
  );
  await schedulerQueue.add(
    'daily-job-fetch',
    {},
    { repeat: { pattern: '0 5 * * *', tz: 'UTC' }, jobId: 'daily-job-fetch' }
  );
  // Interview reminders at 08:00 UTC (emails anyone with an interview <24h away).
  await schedulerQueue.add(
    'interview-reminders',
    {},
    { repeat: { pattern: '0 8 * * *', tz: 'UTC' }, jobId: 'interview-reminders' }
  );
  // 05:15 UTC — a few minutes after daily-job-fetch (05:00), so selection always
  // reads a fully up-to-date JobMatch table. No attempts/backoff: unlike
  // exchange-rate-fetch, there's no downstream job with a hard deadline this needs
  // to beat, and a retried run is already safe (selection's own in-flight/company
  // dedupe makes re-running it a no-op for anything already queued or applied).
  await schedulerQueue.add(
    'apply-bot-select',
    {},
    { repeat: { pattern: '15 5 * * *', tz: 'UTC' }, jobId: 'apply-bot-select' }
  );
}

function createSchedulerWorker() {
  const worker = new Worker(
    'scheduler',
    async (job) => {
      switch (job.name) {
        case 'exchange-rate-fetch':
          return runExchangeRateFetch();
        case 'daily-job-fetch':
          return runDailyJobFetch();
        case 'interview-reminders':
          return runInterviewReminders();
        case 'apply-bot-select':
          return runApplyBotSelection();
        default:
          logger.warn(`scheduler: unknown job "${job.name}"`);
          return null;
      }
    },
    { connection: bullConnection(), concurrency: 1 }
  );

  worker.on('completed', (job) => logger.info(`scheduler: ${job.name} completed`));
  worker.on('failed', (job, err) => logger.error(`scheduler: ${job?.name} failed — ${err?.message}`));

  registerRepeatableJobs().catch((err) => logger.error(`scheduler register: ${err.message}`));
  logger.info('Scheduler worker started (exchange-rate 04:45, daily-fetch 05:00, apply-bot-select 05:15, interview-reminders 08:00 UTC).');
  return worker;
}

module.exports = { createSchedulerWorker };

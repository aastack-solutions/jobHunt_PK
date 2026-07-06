// workers/schedulerWorker.js — createSchedulerWorker() is called ONLY inside
// server.listen() (never at import time), so Railway's zero-downtime deploy can
// never start two workers on the same queue.
//
// Week 3 registers daily-job-fetch (05:00 UTC). Later weeks add exchange-rate-fetch
// (04:45), interview-reminders (08:00), and weekly-cleanup (Sun 03:00).
const { Worker } = require('bullmq');
const logger = require('../logger');
const schedulerQueue = require('../queues/schedulerQueue');
const { bullConnection } = require('../queues/bullConnection');
const { runDailyJobFetch } = require('../../jobs/dailyJobFetch');
const { runExchangeRateFetch } = require('../../jobs/exchangeRateFetch');
const { runInterviewReminders } = require('../../jobs/interviewReminders');

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
  logger.info('Scheduler worker started (exchange-rate 04:45, daily-fetch 05:00, interview-reminders 08:00 UTC).');
  return worker;
}

module.exports = { createSchedulerWorker };

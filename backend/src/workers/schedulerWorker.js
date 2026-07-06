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

// Register repeatable jobs. Never purge existing ones — BullMQ dedupes by jobId,
// so re-adding on every boot is safe and avoids missed runs near a scheduled time.
async function registerRepeatableJobs() {
  await schedulerQueue.add(
    'daily-job-fetch',
    {},
    { repeat: { pattern: '0 5 * * *', tz: 'UTC' }, jobId: 'daily-job-fetch' }
  );
}

function createSchedulerWorker() {
  const worker = new Worker(
    'scheduler',
    async (job) => {
      switch (job.name) {
        case 'daily-job-fetch':
          return runDailyJobFetch();
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
  logger.info('Scheduler worker started (daily-job-fetch @ 05:00 UTC registered).');
  return worker;
}

module.exports = { createSchedulerWorker };

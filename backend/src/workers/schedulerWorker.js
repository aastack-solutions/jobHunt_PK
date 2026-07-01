// Scheduler worker — registers repeatable jobs (exchange-rate-fetch,
// daily-job-fetch, interview-reminders, weekly-cleanup) and processes them.
// Full implementation arrives in Week 3. Started inside server.listen(), never
// at module import time (so Railway's zero-downtime deploy never doubles it).
const logger = require('../logger');

function createSchedulerWorker() {
  logger.info('Scheduler worker stub initialized (no jobs registered yet).');
  return null;
}

module.exports = { createSchedulerWorker };

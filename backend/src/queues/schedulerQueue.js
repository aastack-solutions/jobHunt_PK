// queues/schedulerQueue.js — Queue ONLY (no Worker here). The Worker lives in
// workers/schedulerWorker.js and is created inside server.listen().
const { Queue } = require('bullmq');
const { bullConnection } = require('./bullConnection');

const schedulerQueue = new Queue('scheduler', {
  connection: bullConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

module.exports = schedulerQueue;

// queues/aiQueue.js — Queue ONLY (no Worker here). The Worker lives in
// workers/aiWorker.js and is created inside server.listen().
const { Queue } = require('bullmq');
const { bullConnection } = require('./bullConnection');

const aiQueue = new Queue('ai-tasks', {
  connection: bullConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    // Keep completed jobs around long enough for the client to poll the result.
    removeOnComplete: { age: 3600, count: 200 },
    removeOnFail: { age: 3600, count: 100 },
  },
});

module.exports = aiQueue;

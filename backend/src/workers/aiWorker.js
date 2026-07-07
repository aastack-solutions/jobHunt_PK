// workers/aiWorker.js — createAIWorker() is called ONLY inside server.listen().
// concurrency 1 + limiter (1 request / 3s) keeps us inside Groq's free-tier rate
// limit even when several users generate at once.
const { Worker } = require('bullmq');
const logger = require('../logger');
const { bullConnection } = require('../queues/bullConnection');
const { generate } = require('../services/aiService');

function createAIWorker() {
  const worker = new Worker(
    'ai-tasks',
    async (job) => {
      // job.data = { type, ...featureData }; the worker returns the result object,
      // which BullMQ stores as job.returnvalue for the status endpoint to read.
      return generate(job.data.type, job.data);
    },
    { connection: bullConnection(), concurrency: 1, limiter: { max: 1, duration: 3000 } }
  );

  worker.on('completed', (job) => logger.info(`ai: ${job.data.type} completed (job ${job.id})`));
  worker.on('failed', (job, err) => logger.error(`ai: ${job?.data?.type} failed — ${err?.message}`));

  logger.info('AI worker started (ai-tasks, concurrency 1, 1 req/3s).');
  return worker;
}

module.exports = { createAIWorker };

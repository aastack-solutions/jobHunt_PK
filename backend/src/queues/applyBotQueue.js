// queues/applyBotQueue.js — Queue ONLY (no Worker here). The consuming Worker lives
// in the separate backend/apply-bot/ service (its own Railway deployment), connected
// to this same Redis instance — BullMQ's queue/worker contract is Redis-native, so
// this is the one place the two services are coupled directly rather than over HTTP.
//
// attempts: 1 — unlike AI generation, auto-retrying a failed form submission risks a
// duplicate/garbled application against a live third-party form. A failed ApplyTask
// surfaces in the audit trail instead of silently retrying.
const { Queue } = require('bullmq');
const { bullConnection } = require('./bullConnection');

const applyBotQueue = new Queue('apply-bot-tasks', {
  connection: bullConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 24 * 3600, count: 500 },
  },
});

module.exports = applyBotQueue;

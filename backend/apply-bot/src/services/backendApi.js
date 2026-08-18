// All communication with the backend's Postgres data goes through these authenticated
// HTTP calls — apply-bot never gets DATABASE_URL or a Prisma client of its own (see
// the plan's §1 "No direct DB access from apply-bot").
const axios = require('axios');
const logger = require('../logger');

const client = axios.create({
  baseURL: process.env.BACKEND_URL || 'http://localhost:5000',
  timeout: 15000,
  headers: { 'X-Apply-Bot-Secret': process.env.APPLY_BOT_SECRET },
});

// Both calls below are safe to retry: claimTask is a GET (no side effect beyond
// re-marking the task 'running', which is idempotent), and reportResult is safe to
// retry ONLY because internal.js's callback handler is guarded against overwriting a
// terminal status (submitted/shadow_complete/skipped_*) — a duplicate delivery after
// a dropped response can't downgrade a real success into a false 'failed'. This is a
// small, bounded retry for transient network blips between the two Railway services,
// not a general-purpose resilience layer — logical task failures still get zero
// auto-retry (see applyBotQueue.js's attempts: 1 and worker.js's maxStalledCount: 0).
const RETRY_DELAYS_MS = [1000, 3000];

async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        logger.warn(`backendApi: ${label} failed (attempt ${attempt + 1}) — ${err.message}, retrying`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

async function claimTask(applyTaskId) {
  return withRetry('claimTask', async () => {
    const { data } = await client.get(`/api/internal/apply-bot/tasks/${applyTaskId}`);
    return data;
  });
}

async function reportResult(applyTaskId, result) {
  return withRetry('reportResult', async () => {
    await client.post(`/api/internal/apply-bot/tasks/${applyTaskId}/callback`, result);
  });
}

module.exports = { claimTask, reportResult };

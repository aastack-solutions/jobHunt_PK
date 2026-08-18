// apply-bot service entry point. No public networking (Railway setting, same rule
// as resume-parser) — /health exists only for Railway's own deploy check.
require('dotenv').config();

const express = require('express');
const logger = require('./logger');

const required = ['REDIS_URL', 'BACKEND_URL', 'APPLY_BOT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  logger.error(`FATAL: missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'apply-bot' });
});

const port = parseInt(process.env.PORT || '8100', 10);
app.listen(port, () => {
  logger.info(`apply-bot listening on port ${port}`);
  // Worker started only after the server is bound — never at module scope.
  const { createApplyBotWorker } = require('./worker');
  const worker = createApplyBotWorker();

  // TODO(F7): mount the live-view WS server here, same after-listen timing as the
  // worker above — e.g. `const { attachLiveView } = require('./liveView');
  // attachLiveView(server);` (capture app.listen()'s return value as `server`
  // first). Deliberately NOT wired in yet: liveView.js requires the `ws` package,
  // which is listed in package.json but not yet installed (`npm install` hasn't
  // run in this environment) — requiring it here unconditionally would break this
  // service's startup entirely until that install happens. Wire it in only once
  // `npm install` has actually been run and F7 is being implemented for real.

  // Graceful shutdown: worker.close() stops accepting new jobs and waits for the
  // CURRENT job to actually finish (it does not kill it) before returning — this is
  // what lets a Railway redeploy land without leaving a form-fill mid-way with no
  // result ever reported. IMPORTANT operational requirement this depends on:
  // Railway's SIGTERM→SIGKILL grace period for this service must be increased
  // beyond its default, since a single task can legitimately take up to
  // TASK_DEADLINE_MS (3 minutes, worker.js) to finish — set this when configuring
  // the apply-bot Railway service, not just here in code.
  const shutdown = async (signal) => {
    logger.info(`apply-bot: received ${signal}, closing worker gracefully...`);
    try {
      await worker.close();
      logger.info('apply-bot: worker closed cleanly, exiting.');
      process.exit(0);
    } catch (err) {
      logger.error(`apply-bot: error during graceful shutdown — ${err.message}`);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});

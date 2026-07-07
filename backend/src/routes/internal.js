// /api/internal/* — cron-triggered internal endpoints, guarded by CRON_SECRET.
// The external backup scheduler (and local manual testing) hit trigger-fetch to
// run the daily fetch on demand without waiting for the 05:00 UTC repeatable job.
const express = require('express');
const logger = require('../logger');
const { runDailyJobFetch } = require('../../jobs/dailyJobFetch');

const router = express.Router();

// Guards internal endpoints with the CRON secret header.
function requireCronSecret(req, res, next) {
  const provided = req.get('X-Cron-Secret');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

router.post('/trigger-fetch', requireCronSecret, async (req, res) => {
  logger.info('internal: trigger-fetch invoked');
  const result = await runDailyJobFetch();
  return res.json({ ok: true, ...result });
});

module.exports = router;

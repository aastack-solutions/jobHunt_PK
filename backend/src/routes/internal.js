// /api/internal/* — cron-triggered internal endpoints.
// Full implementation (trigger-fetch) arrives in Week 3.
const express = require('express');

const router = express.Router();

// Guards internal endpoints with the CRON secret header.
function requireCronSecret(req, res, next) {
  const provided = req.get('X-Cron-Secret');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

router.post('/trigger-fetch', requireCronSecret, (req, res) => {
  res.status(501).json({ message: 'Built in Week 3' });
});

module.exports = router;

// /api/ai — enqueue + status. Full implementation arrives in Week 4.
const express = require('express');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.post('/enqueue', requireAuth, (req, res) => {
  res.status(501).json({ message: 'Built in Week 4' });
});

router.get('/status/:id', requireAuth, (req, res) => {
  res.status(501).json({ message: 'Built in Week 4' });
});

module.exports = router;

// /api/applications — full implementation arrives in Week 3.
const express = require('express');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.status(501).json({ message: 'Built in Week 3' });
});

module.exports = router;

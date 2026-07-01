// GET /health — pings DB + Redis. Railway uses this to confirm deployments.
const express = require('express');
const prisma = require('../db');
const redisClient = require('../redis');

const router = express.Router();

router.get('/', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  await redisClient.ping();
  res.json({ status: 'ok', service: 'backend' });
});

module.exports = router;

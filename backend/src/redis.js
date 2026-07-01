// Redis singleton (redis@4.7.1 official client — never ioredis).
// Creates one client and connects once at import time.
const { createClient } = require('redis');
const logger = require('./logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));
redisClient.on('connect', () => logger.info('Redis connected'));

// Connect once. BullMQ uses ioredis internally via its own connection;
// this client is for sessions, lockouts, caches, and the health check.
redisClient.connect().catch((err) => {
  logger.error(`Redis initial connection failed: ${err.message}`);
});

module.exports = redisClient;

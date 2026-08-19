// Mirrors backend/src/queues/bullConnection.js — parses REDIS_URL into BullMQ
// connection options. Own copy for the same reason as logger.js.
const { URL } = require('url');

function bullConnection() {
  const raw = process.env.REDIS_URL || 'redis://localhost:6379';
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    // See backend/src/queues/bullConnection.js's matching comment (found + fixed
    // 2026-08-19, F2 verification): without this, a rediss:// URL (Upstash, etc.)
    // silently connects over plain TCP and hangs on the handshake instead of
    // erroring. Same bug, same fix, mirrored here for the same reason as logger.js.
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

module.exports = { bullConnection };

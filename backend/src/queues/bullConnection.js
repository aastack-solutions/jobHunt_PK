// queues/bullConnection.js — parses REDIS_URL into BullMQ connection options.
// BullMQ uses ioredis internally (allowed); our own code still uses redis@4 only.
// maxRetriesPerRequest: null is required by BullMQ workers for blocking commands.
const { URL } = require('url');

function bullConnection() {
  const raw = process.env.REDIS_URL || 'redis://localhost:6379';
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    // ioredis only speaks TLS if told to explicitly — building this object by hand
    // (rather than handing ioredis the URL string directly) silently drops that
    // signal unless we re-derive it from the scheme. Without this, every BullMQ
    // connection against a rediss:// provider (e.g. Upstash) hangs on the TCP
    // handshake instead of erroring, since it's speaking plain TCP to a TLS-only port.
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

module.exports = { bullConnection };

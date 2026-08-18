// Mirrors backend/src/logger.js — same Winston shape, kept as its own copy since
// apply-bot ships its own package.json/node_modules (no shared code across the
// Docker build boundary between the two services).
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, stack }) =>
          `${timestamp} [${level}] ${stack || message}`)
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;

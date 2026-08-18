// JobHunt PK backend — Express 5 application entry point.
require('dotenv').config();

const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const session = require('express-session');
const { RedisStore } = require('connect-redis'); // named export in connect-redis@9

const logger = require('./logger');
const redisClient = require('./redis');
const { apiLimiter, internalLimiter } = require('./middleware/rateLimiter');

const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const usersRoute = require('./routes/users');
const resumesRoute = require('./routes/resumes');
const jobsRoute = require('./routes/jobs');
const applicationsRoute = require('./routes/applications');
const interviewsRoute = require('./routes/interviews');
const aiRoute = require('./routes/ai');
const dashboardRoute = require('./routes/dashboard');
const internalRoute = require('./routes/internal');
const applyCredentialsRoute = require('./routes/applyCredentials');
const applyTasksRoute = require('./routes/applyTasks');

// ---- Startup env validation: fail loudly on missing core vars ----
function validateEnv() {
  const required = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(
      `FATAL: missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in backend/.env (copy from .env.example) before starting.'
    );
    process.exit(1);
  }
  // Optional integrations — warn but do not block local startup.
  const optional = [
    'GROQ_API_KEY', 'BREVO_SMTP_USER', 'BREVO_SMTP_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
    'INTERNAL_SECRET', 'CRON_SECRET', 'NOMINATIM_USER_AGENT',
    'APPLY_BOT_SECRET', 'APPLY_BOT_MASTER_KEY', 'APPLY_BOT_ENABLED', 'APPLY_BOT_MODE', 'APPLY_BOT_DAILY_CAP',
  ];
  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    logger.warn(`Optional env not set (related features degraded): ${missingOptional.join(', ')}`);
  }
}

validateEnv();

const app = express();
const isProd = process.env.NODE_ENV === 'production';
if (isProd) app.set('trust proxy', 1); // honor Railway's proxy for secure cookies

// ---- Middleware order is fixed (see backend/CLAUDE.md) ----
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(
  session({
    store: new RedisStore({ client: redisClient, prefix: 'sess:' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);
app.use(express.static(path.join(__dirname, '../public')));

// authLimiter is applied per-route in routes/auth.js (login + register only) so
// that frequently-called /api/auth/me and /logout are not rate-limited.
// apiLimiter skips /api/internal/* (see rateLimiter.js) — that path gets its own,
// more generous internalLimiter instead, so public traffic and trusted
// service-to-service traffic never share one rate-limit bucket.
app.use('/api', apiLimiter);
app.use('/api/internal', internalLimiter);

// ---- Routes ----
app.use('/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/users', usersRoute);
app.use('/api/resumes', resumesRoute);
app.use('/api/jobs', jobsRoute);
app.use('/api/applications', applicationsRoute);
app.use('/api/interviews', interviewsRoute);
app.use('/api/ai', aiRoute);
app.use('/api/dashboard', dashboardRoute);
app.use('/api/internal', internalRoute);
app.use('/api/apply-credentials', applyCredentialsRoute);
app.use('/api/apply-tasks', applyTasksRoute);

// ---- SPA fallback — Express 5 requires a NAMED wildcard ----
function serveReact(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.sendFile(path.join(__dirname, '../public/index.html'));
}
app.get('/*path', serveReact);

// ---- Global error handler — always last, never leaks stack in prod ----
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Max 10 MB.' });
  }
  logger.error(err.stack || err.message || String(err));
  const body = { error: 'Internal server error' };
  if (!isProd) body.detail = err.message;
  return res.status(err.status || 500).json(body);
}
app.use(globalErrorHandler);

// ---- Start server, then start workers (never at import time) ----
const port = parseInt(process.env.PORT || '5000', 10);
const server = app.listen(port, () => {
  logger.info(`Backend listening on port ${port}`);
  const { createSchedulerWorker } = require('./workers/schedulerWorker');
  const { createAIWorker } = require('./workers/aiWorker');
  createSchedulerWorker();
  createAIWorker();
});

module.exports = { app, server };

// Rate limiters. express-rate-limit@8 uses `limit` (not `max`).
const rateLimit = require('express-rate-limit');

// Tight limit on auth endpoints to slow credential stuffing.
// Defaults to 5 per the spec; AUTH_RATE_LIMIT overrides it (used only to
// exercise the per-email lockout path during local verification).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT || '5', 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// General API limit.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter };

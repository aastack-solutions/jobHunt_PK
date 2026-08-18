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

// General API limit — public/user-facing routes only. Internal service-to-service
// traffic (apply-bot claiming/reporting tasks, the cron trigger) is excluded here
// and given its own limiter below: it's secret-header-authenticated already (not
// exposed to arbitrary public clients), and sharing one IP-keyed bucket with public
// traffic means a burst of legitimate public API usage from the same egress IP
// could 429 the internal service's own calls — a self-inflicted availability bug,
// not a security boundary either limiter is meant to enforce.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => req.path.startsWith('/internal'),
});

// Internal-only limit — generous, since this is trusted service-to-service traffic,
// but still present as a circuit breaker against a runaway retry loop (e.g. a bug
// causing the apply-bot worker to hammer the callback endpoint) rather than an
// unbounded internal surface.
const internalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many internal requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter, internalLimiter };

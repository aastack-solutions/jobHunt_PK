// /api/auth/* — register, login, me, logout.
// Express 5 auto-catches async errors; do not wrap handlers in try/catch + next.
const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const prisma = require('../db');
const redisClient = require('../redis');
const requireAuth = require('../middleware/requireAuth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const BCRYPT_COST = 12;
const LOCK_THRESHOLD = 10;
const LOCK_TTL_SECONDS = 1800;

// Precomputed once at module load — found 2026-08-21 (security review). Without
// this, a login against a non-existent email skipped bcrypt.compare entirely and
// returned near-instantly, while a wrong-password attempt against a real email
// paid the full ~50-100ms compare cost. Both responses are the identical 401
// "Invalid credentials" body, but the timing difference lets an attacker
// distinguish "unknown email" from "known email, wrong password" anyway —
// undermining this file's own stated intent ("Never reveal whether the email
// exists"). Comparing against this fixed decoy hash when no user is found means
// every login attempt pays the same bcrypt cost regardless of outcome.
const DUMMY_HASH_FOR_TIMING = bcrypt.hashSync('no-such-user-timing-decoy', BCRYPT_COST);

// Promisified req.session.regenerate() — found 2026-08-21 (security review).
// Neither /register nor /login called this before assigning req.session.userId,
// so the session id issued before authentication (e.g. to an anonymous visitor)
// was reused after login rather than replaced — a session-fixation shape. Real
// exploitability here is low (cookies are httpOnly/secure(prod)/sameSite:strict,
// which closes off the common ways an attacker plants a known session id on a
// victim on this same-origin app), but issuing a fresh session id on privilege
// change is standard practice and cheap to do correctly.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

// Strip the password hash before returning a user to the client.
function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function lockKey(email) {
  return `login_fail:${email.toLowerCase()}`;
}

router.post('/register', authLimiter, async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }
  const { email, password, fullName } = result.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash, fullName },
  });

  await regenerateSession(req);
  req.session.userId = user.id;
  return res.status(201).json(publicUser(user));
});

router.post('/login', authLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }
  const { email, password } = result.data;
  const normalizedEmail = email.toLowerCase();
  const key = lockKey(normalizedEmail);

  const failures = parseInt((await redisClient.get(key)) || '0', 10);
  if (failures >= LOCK_THRESHOLD) {
    return res.status(429).json({
      error: 'Account temporarily locked due to too many failed attempts. Try again later.',
    });
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const valid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH_FOR_TIMING);

  if (!user || !valid) {
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, LOCK_TTL_SECONDS);
    // Never reveal whether the email exists.
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await redisClient.del(key);
  await regenerateSession(req);
  req.session.userId = user.id;
  return res.json(publicUser(user));
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

module.exports = router;

// Security fixes 2026-08-21 (code review) — two real bugs in auth.js:
//
// 1. Login timing side-channel: a login attempt against a non-existent email
//    skipped bcrypt.compare entirely and returned near-instantly, while a
//    wrong-password attempt against a real email paid the full bcrypt cost —
//    letting an attacker distinguish "unknown email" from "known email, wrong
//    password" via response timing even though both return the identical 401
//    body. Fixed by always comparing against either the real hash or a fixed
//    decoy hash of the same cost.
// 2. No session regeneration on login: req.session.userId was assigned onto
//    whatever session id the request already carried, rather than a fresh one
//    issued at authentication time (session-fixation shape).
//
// See MEMORY.md's 2026-08-21 entry for the full writeup.
//
// This exercises the REAL session middleware (express-session + connect-redis,
// same setup as app.js) rather than the fake-session-middleware pattern used
// elsewhere in this directory, since both fixes are only observable through
// real session/Redis mechanics. redis.js's own singleton retries indefinitely
// on a failed connection (by design, for the running server) — importing it
// directly here would hang this test file's discovery when Redis is
// unreachable, so reachability is probed first with a bounded, throwaway
// client that gives up after a few seconds, and the real modules are only
// required once that probe succeeds.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const hasDbUrl = Boolean(process.env.DATABASE_URL);
const hasRedisUrl = Boolean(process.env.REDIS_URL);

async function probeRedis(timeoutMs = 3000) {
  if (!hasRedisUrl) return false;
  const { createClient } = require('redis');
  const client = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
  });
  client.on('error', () => {});
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('probe timeout')), timeoutMs)),
    ]);
    await client.disconnect().catch(() => {});
    return true;
  } catch {
    await client.destroy?.().catch?.(() => {});
    return false;
  }
}

let BASE_URL = null;
let ownServer = null;
let prisma = null;

async function ensureServer() {
  if (BASE_URL) return true;
  if (!hasDbUrl) return false;
  if (!(await probeRedis())) return false;

  prisma = require('../src/db');
  const redisClient = require('../src/redis');
  // redis.js connects at import time but doesn't await it — give the already-
  // probed-reachable connection a moment to finish before using it for real.
  if (!redisClient.isOpen) {
    await new Promise((resolve) => redisClient.once('connect', resolve));
  }

  const express = require('express');
  const session = require('express-session');
  const { RedisStore } = require('connect-redis');
  const authRoute = require('../src/routes/auth');

  const app = express();
  app.use(express.json());
  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: 'sess:auth-test:' }),
      secret: process.env.SESSION_SECRET || 'test-secret-not-for-production',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'strict', maxAge: 60000 },
    })
  );
  app.use('/api/auth', authRoute);

  await new Promise((resolve) => {
    ownServer = app.listen(0, '127.0.0.1', resolve);
  });
  BASE_URL = `http://127.0.0.1:${ownServer.address().port}`;
  return true;
}

after(async () => {
  if (ownServer) await new Promise((resolve) => ownServer.close(resolve));
  if (!prisma) return;
  if (ensureServer.testUser) {
    await prisma.user.delete({ where: { id: ensureServer.testUser.id } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

function extractSid(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/connect\.sid=([^;]+)/);
  return match ? match[1] : null;
}

test('POST /api/auth/login: an unknown email still pays the bcrypt.compare cost (timing side-channel fix)', async (t) => {
  if (!(await ensureServer())) {
    t.skip('requires a reachable DATABASE_URL and REDIS_URL — not available');
    return;
  }

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `no-such-user-${Date.now()}@test.local`, password: 'whatever123' }),
  });
  const elapsed = Date.now() - start;

  assert.equal(res.status, 401);
  // A real bcrypt.compare at cost 12 takes tens of milliseconds. The old code
  // skipped it entirely for an unknown email and returned in low single-digit
  // ms. This threshold is generous (well below a real compare's typical cost)
  // specifically to avoid flaking on a slow CI machine, while still failing
  // if the shortcut path is ever reintroduced.
  assert.ok(elapsed >= 15, `expected the compare to actually run (>=15ms), took ${elapsed}ms`);
});

test('POST /api/auth/login: each successful login issues a fresh session id (session-fixation fix)', async (t) => {
  if (!(await ensureServer())) {
    t.skip('requires a reachable DATABASE_URL and REDIS_URL — not available');
    return;
  }

  const email = `auth-regen-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const password = 'a-real-password-123';

  const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'Auth Regen Test' }),
  });
  assert.equal(registerRes.status, 201);
  const registeredUser = await registerRes.json();
  ensureServer.testUser = registeredUser;

  const firstLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(firstLogin.status, 200);
  const sid1 = extractSid(firstLogin.headers.get('set-cookie'));
  assert.ok(sid1, 'login must set a session cookie');

  // Log in again, presenting the FIRST session's cookie — if the session were
  // reused rather than regenerated, the second login would keep the same sid.
  const secondLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `connect.sid=${sid1}` },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(secondLogin.status, 200);
  const sid2 = extractSid(secondLogin.headers.get('set-cookie'));
  assert.ok(sid2, 'the second login must also set a session cookie');

  assert.notEqual(sid2, sid1, 'each successful login must issue a fresh session id, not reuse the prior one');
});

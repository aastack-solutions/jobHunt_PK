// F13 (lives on F1's branch) — /api/applications's idempotent duplicate guard.
// Added 2026-08-21 (code review): POST / had no server-side check against
// creating two Application rows for the same jobId — the frontend's disabled
// "Applied" button state is real but client-side only, not airtight against
// two open tabs or a rapid double-click racing the button's own disable. See
// MEMORY.md's 2026-08-21 entry for the full writeup.
//
// Mounts the real applications.js router on a throwaway server, same pattern
// as applyTaskCallback.test.js in this directory — but with a minimal fake
// session middleware in place of express-session, since requireAuth only ever
// reads req.session.userId and a raw WS-style throwaway server doesn't have a
// real Redis-backed session store wired up. This exercises the actual route
// handler, not a reimplementation of its logic.
//
// Requires DATABASE_URL (live database) — self-skips when absent, same
// convention as the other DB-dependent files in this directory.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const hasDb = Boolean(process.env.DATABASE_URL);

let BASE_URL = null;
let ownServer = null;
let prisma = null;

async function ensureServer() {
  if (!hasDb) return false;
  if (BASE_URL) return true;

  prisma = require('../src/db');
  const testUser = await prisma.user.create({
    data: {
      email: `f13-apps-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      fullName: 'F13 Applications Test User',
    },
  });

  const express = require('express');
  const applicationsRoute = require('../src/routes/applications');
  const app = express();
  app.use(express.json());
  // Minimal stand-in for express-session — requireAuth only ever reads
  // req.session.userId, so this is enough to exercise the real route without
  // needing a live Redis session store.
  app.use((req, _res, next) => {
    req.session = { userId: testUser.id };
    next();
  });
  app.use('/api/applications', applicationsRoute);

  await new Promise((resolve) => {
    ownServer = app.listen(0, '127.0.0.1', resolve);
  });
  BASE_URL = `http://127.0.0.1:${ownServer.address().port}`;
  ensureServer.testUser = testUser;
  return true;
}

after(async () => {
  if (ownServer) await new Promise((resolve) => ownServer.close(resolve));
  if (!hasDb || !prisma) return;
  if (ensureServer.testUser) {
    await prisma.application.deleteMany({ where: { userId: ensureServer.testUser.id } });
    await prisma.job.deleteMany({ where: { company: 'F13 Dup Guard Test Co' } });
    await prisma.user.delete({ where: { id: ensureServer.testUser.id } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

async function post(body) {
  return fetch(`${BASE_URL}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/applications twice for the same jobId does not create a second Application', async (t) => {
  if (!(await ensureServer())) {
    t.skip('requires DATABASE_URL (a live database) — not set');
    return;
  }

  const job = await prisma.job.create({
    data: {
      platform: 'greenhouse',
      externalId: `f13-dup-test-${Date.now()}`,
      contentHash: `f13-dup-test-hash-${Date.now()}`,
      title: 'Dup Guard Test Role',
      company: 'F13 Dup Guard Test Co',
      locationType: 'Remote',
      applyUrl: 'https://boards.greenhouse.io/dupguardtest/jobs/1',
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });

  const first = await post({ jobId: job.id });
  assert.equal(first.status, 201, 'the first POST creates a new Application');
  const firstBody = await first.json();

  const second = await post({ jobId: job.id });
  assert.equal(second.status, 200, 'the second POST for the same jobId must NOT be a 201 create');
  const secondBody = await second.json();
  assert.equal(secondBody.id, firstBody.id, 'the second POST must return the SAME row, not a new one');

  const rows = await prisma.application.findMany({ where: { userId: ensureServer.testUser.id, jobId: job.id } });
  assert.equal(rows.length, 1, 'exactly one Application row must exist for this job, not two');
});

test('POST /api/applications without a jobId is never deduped (manual entries can repeat)', async (t) => {
  if (!(await ensureServer())) {
    t.skip('requires DATABASE_URL (a live database) — not set');
    return;
  }

  const body = { jobTitle: 'Freehand Entry', company: 'Some Co', locationType: 'Remote' };
  const first = await post(body);
  assert.equal(first.status, 201);
  const second = await post(body);
  assert.equal(second.status, 201, 'jobId-less manual entries are not deduped — they have no natural identity to key on');

  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.notEqual(firstBody.id, secondBody.id);
});

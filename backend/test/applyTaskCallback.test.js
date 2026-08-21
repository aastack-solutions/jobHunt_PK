// F10 — integration test for internal.js's callback idempotency guard
// (TERMINAL_STATUSES) — the test that would have caught the exact bug
// backendApi.js's retry wrapper could otherwise have reintroduced (a duplicate
// 'submitted' callback creating a second Application row). See
// docs/apply-bot/TECHNICAL_PLAN.md's "Security Findings & Fixes" #6.
//
// Un-skipped 2026-08-19 (F2 verification session): needs a live Postgres database
// AND a running backend instance (`npm run dev`) to hit real HTTP endpoints
// against. Both skip gracefully (rather than failing `npm test`) when either is
// unavailable, since this is the one file in the suite that can't run in a plain
// CI checkout without a database.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const APPLY_BOT_SECRET = process.env.APPLY_BOT_SECRET;
// Fixed 2026-08-20 (code review): `npm test` preloads the real backend/.env
// unconditionally (package.json: `node -r dotenv/config --test`), so having
// DATABASE_URL configured for normal dev work was enough, by itself, to make this
// file silently create/delete real rows on every `npm test` run — no explicit
// choice required. RUN_DB_TESTS=true is now a deliberate, separate opt-in: DB
// tests skip by default even with a valid DATABASE_URL present, so running them
// against a real database is something a developer has to consciously ask for.
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.RUN_DB_TESTS === 'true';

async function backendIsUp() {
  if (!hasDb || !APPLY_BOT_SECRET) return false;
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function callback(taskId, body) {
  return fetch(`${BASE_URL}/api/internal/apply-bot/tasks/${taskId}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Apply-Bot-Secret': APPLY_BOT_SECRET },
    body: JSON.stringify(body),
  });
}

test('apply-bot callback idempotency', async (t) => {
  if (!(await backendIsUp())) {
    const reason = Boolean(process.env.DATABASE_URL) && process.env.RUN_DB_TESTS !== 'true'
      ? 'DATABASE_URL is set but RUN_DB_TESTS=true was not — set it explicitly to run this against a real database'
      : 'requires a live database AND a running backend instance (npm run dev) — neither confirmed reachable';
    t.skip(reason);
    return;
  }

  const prisma = require('../src/db');

  // `fixture` is populated incrementally as each row is created, not returned only
  // on full success — this is what lets cleanup() actually clean up a PARTIAL
  // failure (e.g. user created, then job creation throws), not just a full
  // success. Fixed 2026-08-20 (code review): the previous version called
  // seedTask() outside the try block and returned a fixture object only at the
  // end, so a throw partway through left whatever had already been created
  // (typically the User row) permanently orphaned in the database, since cleanup()
  // never even ran.
  async function seedTask(fixture) {
    fixture.user = await prisma.user.create({
      data: {
        email: `callback-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
        passwordHash: 'x',
        fullName: 'Callback Test User',
      },
    });
    fixture.job = await prisma.job.create({
      data: {
        platform: 'greenhouse',
        externalId: `callback-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        contentHash: `callback-test-hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: 'Callback Test Role',
        company: 'Callback Test Co',
        locationType: 'Remote',
        applyUrl: 'https://boards.greenhouse.io/callbacktest/jobs/1',
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    fixture.task = await prisma.applyTask.create({
      data: {
        userId: fixture.user.id,
        jobId: fixture.job.id,
        applyUrl: fixture.job.applyUrl,
        adapterUsed: 'greenhouse',
        mode: 'live', // must be 'live' — the F2 fix gates Application creation on task.mode === 'live'
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  // Cleans up whatever was actually created, in dependency order, tolerating any
  // step never having been reached (a partial seedTask() failure) or already being
  // gone (e.g. the callback itself created dependent rows).
  async function cleanup(fixture) {
    if (fixture.user) {
      await prisma.applyTask.deleteMany({ where: { userId: fixture.user.id } }).catch(() => {});
      await prisma.application.deleteMany({ where: { userId: fixture.user.id } }).catch(() => {});
    }
    if (fixture.job) {
      await prisma.job.delete({ where: { id: fixture.job.id } }).catch(() => {});
    }
    if (fixture.user) {
      await prisma.user.delete({ where: { id: fixture.user.id } }).catch(() => {});
    }
  }

  await t.test('a duplicate submitted callback for an already-terminal task does not create a second Application', async () => {
    const fixture = {};
    try {
      await seedTask(fixture);
      const first = await callback(fixture.task.id, { status: 'submitted' });
      assert.equal(first.status, 200);
      const firstBody = await first.json();
      assert.equal(firstBody.alreadyTerminal, undefined);

      const second = await callback(fixture.task.id, { status: 'submitted' });
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.equal(secondBody.alreadyTerminal, true);

      const apps = await prisma.application.findMany({ where: { userId: fixture.user.id } });
      assert.equal(apps.length, 1, 'exactly one Application row must exist, not two');
    } finally {
      await cleanup(fixture);
    }
  });

  await t.test('a stale failed callback cannot downgrade an already-submitted task', async () => {
    const fixture = {};
    try {
      await seedTask(fixture);
      await callback(fixture.task.id, { status: 'submitted' });

      const failedRes = await callback(fixture.task.id, { status: 'failed', failureClass: 'NETWORK' });
      const failedBody = await failedRes.json();
      assert.equal(failedBody.alreadyTerminal, true);

      const updated = await prisma.applyTask.findUnique({ where: { id: fixture.task.id } });
      assert.equal(updated.status, 'submitted', 'status must still be submitted, not downgraded to failed');
    } finally {
      await cleanup(fixture);
    }
  });

  await t.test('a shadow-mode task reporting submitted does NOT create an Application (the F2 fix this whole file exists to guard)', async () => {
    const fixture = {};
    try {
      await seedTask(fixture);
      // Override to shadow mode specifically for this test — everything else
      // reuses the same seedTask() fixture shape.
      await prisma.applyTask.update({ where: { id: fixture.task.id }, data: { mode: 'shadow' } });

      const res = await callback(fixture.task.id, { status: 'submitted' });
      assert.equal(res.status, 200);

      const apps = await prisma.application.findMany({ where: { userId: fixture.user.id } });
      assert.equal(apps.length, 0, 'a shadow-mode task must never create a real Application, even if it reports submitted');
    } finally {
      await cleanup(fixture);
    }
  });
});

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
const hasDb = Boolean(process.env.DATABASE_URL);

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
    t.skip('requires a live database AND a running backend instance (npm run dev) — neither confirmed reachable');
    return;
  }

  const prisma = require('../src/db');

  async function seedTask() {
    const user = await prisma.user.create({
      data: {
        email: `callback-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
        passwordHash: 'x',
        fullName: 'Callback Test User',
      },
    });
    const job = await prisma.job.create({
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
    const task = await prisma.applyTask.create({
      data: {
        userId: user.id,
        jobId: job.id,
        applyUrl: job.applyUrl,
        adapterUsed: 'greenhouse',
        mode: 'shadow',
        status: 'running',
        startedAt: new Date(),
      },
    });
    return { user, job, task };
  }

  async function cleanup({ user, job, task }) {
    await prisma.applyTask.deleteMany({ where: { userId: user.id } });
    await prisma.application.deleteMany({ where: { userId: user.id } });
    await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } });
  }

  await t.test('a duplicate submitted callback for an already-terminal task does not create a second Application', async () => {
    const fixture = await seedTask();
    try {
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
    const fixture = await seedTask();
    try {
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
});

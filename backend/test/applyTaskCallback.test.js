// F10 — integration test for internal.js's callback idempotency guard
// (TERMINAL_STATUSES) — the test that would have caught the exact bug
// backendApi.js's retry wrapper could otherwise have reintroduced (a duplicate
// 'submitted' callback creating a second Application row). See
// docs/apply-bot/TECHNICAL_PLAN.md's "Security Findings & Fixes" #6.
//
// Un-skipped 2026-08-19 (F2 verification session). Made self-sufficient 2026-08-19
// (F10): it used to also require somebody to have started a backend by hand
// (`npm run dev`) before `npm test`, which meant that in practice it silently
// skipped on almost every run -- a test nobody was actually running. It now starts
// its own throwaway HTTP server on an ephemeral port, so a live DATABASE_URL is the
// only external thing it needs.
//
// Deliberately mounts ONLY the internal router rather than requiring src/app.js:
// app.js binds port 5000 and starts the scheduler and AI workers as an import side
// effect, none of which this test wants. The router is the actual code under test,
// and express.json() is the only middleware its handlers depend on.
//
// Set TEST_BASE_URL to point at an already-running backend instead, if you want to
// exercise the full middleware stack (rate limiter, session, etc.).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const APPLY_BOT_SECRET = process.env.APPLY_BOT_SECRET;
const hasDb = Boolean(process.env.DATABASE_URL);

let BASE_URL = process.env.TEST_BASE_URL || null;
let ownServer = null;

// Started lazily so that a run without DATABASE_URL never imports the router at
// all -- requiring it pulls in the BullMQ queue, which would open a Redis
// connection just to be skipped.
async function ensureBackend() {
  if (!hasDb || !APPLY_BOT_SECRET) return false;
  if (BASE_URL) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
  const express = require('express');
  const internalRoute = require('../src/routes/internal');
  const app = express();
  app.use(express.json());
  app.use('/api/internal', internalRoute);
  await new Promise((resolve) => {
    ownServer = app.listen(0, '127.0.0.1', resolve); // port 0 = let the OS pick a free one
  });
  BASE_URL = `http://127.0.0.1:${ownServer.address().port}`;
  return true;
}

// Requiring the router opens a BullMQ/Redis connection and a Prisma pool; without
// closing them the test runner would sit there with live handles after the last
// assertion instead of exiting.
after(async () => {
  if (ownServer) await new Promise((resolve) => ownServer.close(resolve));
  if (!hasDb) return;
  await require('../src/queues/applyBotQueue').close().catch(() => {});
  const redis = require('../src/redis');
  if (redis.isOpen) await redis.quit().catch(() => {});
  await require('../src/db').$disconnect().catch(() => {});
});

async function callback(taskId, body) {
  return fetch(`${BASE_URL}/api/internal/apply-bot/tasks/${taskId}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Apply-Bot-Secret': APPLY_BOT_SECRET },
    body: JSON.stringify(body),
  });
}

test('apply-bot callback idempotency', async (t) => {
  if (!(await ensureBackend())) {
    t.skip('requires DATABASE_URL and APPLY_BOT_SECRET (a live database) -- not set');
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

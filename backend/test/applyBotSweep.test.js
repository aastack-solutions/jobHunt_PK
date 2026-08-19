// F10 — applyBotSweep.js's staleness thresholds. Uses the real Prisma client
// directly (no HTTP server needed, unlike applyTaskCallback.test.js) — just a live
// database to write/read fixture rows against.
//
// Un-skipped 2026-08-19 (F2 verification session) now that a live database exists
// (see MEMORY.md). Requires DATABASE_URL to be set — run via `npm test` with a
// real backend/.env in place; these two are skipped automatically when it's absent
// so `npm test` still passes cleanly in an environment with no DB configured.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const hasDb = Boolean(process.env.DATABASE_URL);
const skipReason = hasDb ? false : 'requires DATABASE_URL (live database) — not set';

let prisma;
let sweepStaleApplyTasks;
let RUNNING_STALE_MS;

if (hasDb) {
  prisma = require('../src/db');
  ({ sweepStaleApplyTasks, RUNNING_STALE_MS } = require('../jobs/applyBotSweep'));
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `sweep-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      fullName: 'Sweep Test User',
    },
  });
}

test('a task running since RUNNING_STALE_MS + 1 gets swept to unknown_outcome', { skip: skipReason }, async () => {
  const user = await makeUser();
  try {
    const task = await prisma.applyTask.create({
      data: {
        userId: user.id,
        applyUrl: 'https://boards.greenhouse.io/sweeptest/jobs/1',
        adapterUsed: 'greenhouse',
        mode: 'shadow',
        status: 'running',
        startedAt: new Date(Date.now() - RUNNING_STALE_MS - 60000),
      },
    });

    await sweepStaleApplyTasks();

    const updated = await prisma.applyTask.findUnique({ where: { id: task.id } });
    assert.equal(updated.status, 'unknown_outcome');
    assert.match(updated.failureReason, /likely crashed/);
  } finally {
    await prisma.applyTask.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test('a task running for less than the threshold is left untouched', { skip: skipReason }, async () => {
  const user = await makeUser();
  try {
    const task = await prisma.applyTask.create({
      data: {
        userId: user.id,
        applyUrl: 'https://boards.greenhouse.io/sweeptest/jobs/2',
        adapterUsed: 'greenhouse',
        mode: 'shadow',
        status: 'running',
        startedAt: new Date(Date.now() - 5000), // 5s ago — well under the threshold
      },
    });

    await sweepStaleApplyTasks();

    const updated = await prisma.applyTask.findUnique({ where: { id: task.id } });
    assert.equal(updated.status, 'running');
  } finally {
    await prisma.applyTask.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

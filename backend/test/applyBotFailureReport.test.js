// F9 — applyBotFailureReport.js's per-adapter success rate and failure-class
// breakdown, against seeded fixture rows (TEST_PLAN.md F9, item 4).
//
// Isolation note (this is the whole trick that makes these assertions exact):
// runApplyBotFailureReport() reports GLOBALLY — it deliberately has no userId
// filter, because "what's our Greenhouse success rate this week" is a team-level
// question, not a per-user one. That means any other rows already in the database
// would pollute a naive assertion. So each test seeds its rows under a UNIQUE,
// test-only `adapterUsed` name and asserts on that key of perAdapterBreakdown —
// exact numbers, no interference, and no production-code change just to make the
// test easier. The two genuinely global figures (failureBreakdown, the SchedulerLog
// row) are asserted as before/after DELTAS for the same reason.
//
// Requires DATABASE_URL (live database) — self-skips when absent so `npm test`
// still passes cleanly in a DB-less environment, same as applyBotSweep.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const hasDb = Boolean(process.env.DATABASE_URL);
const skipReason = hasDb ? false : 'requires DATABASE_URL (live database) — not set';

let prisma;
let runApplyBotFailureReport;

if (hasDb) {
  prisma = require('../src/db');
  ({ runApplyBotFailureReport } = require('../jobs/applyBotFailureReport'));
}

function uniqueAdapter(label) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `f9-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      fullName: 'F9 Report Test User',
    },
  });
}

// `rows` is a list of partial ApplyTask shapes — everything else gets a sane default.
async function seedTasks(userId, adapterUsed, rows) {
  await prisma.applyTask.createMany({
    data: rows.map((row, i) => ({
      userId,
      applyUrl: `https://example.test/f9/${adapterUsed}/${i}`,
      adapterUsed,
      mode: 'shadow',
      ...row,
    })),
  });
}

async function cleanup(userId, startedAt) {
  await prisma.applyTask.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.schedulerLog.deleteMany({
    where: { jobName: 'apply-bot-failure-report', ranAt: { gte: startedAt } },
  });
}

test('per-adapter success rate is computed from resolved tasks only', { skip: skipReason }, async () => {
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('rate');
  try {
    await seedTasks(user.id, adapter, [
      { status: 'submitted' },
      { status: 'shadow_complete' }, // counts as success — shadow mode has no real submit
      { status: 'failed', failureClass: 'PORTAL_LAYOUT' },
      { status: 'skipped_low_confidence' },
      { status: 'queued' }, // in flight — must be in NEITHER numerator nor denominator
      { status: 'running' },
      { status: 'paused_human', pauseReason: 'captcha' },
    ]);

    const report = await runApplyBotFailureReport();
    const stats = report.perAdapterBreakdown[adapter];

    assert.ok(stats, 'seeded adapter should appear in the breakdown');
    assert.equal(stats.total, 7);
    assert.equal(stats.inFlight, 3, 'queued + running + paused_human are in flight');
    assert.equal(stats.resolved, 4, 'only the 4 resolved tasks form the denominator');
    assert.equal(stats.succeeded, 2);
    assert.equal(stats.failed, 1);
    assert.equal(stats.abstained, 1);
    assert.equal(stats.successRate, 50, '2 of 4 resolved = 50%, NOT 2 of 7');
    assert.equal(stats.abstainRate, 25);
  } finally {
    await cleanup(user.id, startedAt);
  }
});

test('unknown_outcome tasks are tracked, not silently dropped from the resolved breakdown', { skip: skipReason }, async () => {
  // Found and fixed 2026-08-20 (code review): 'unknown_outcome' (set for real by
  // applyBotSweep.js when the apply-bot process crashes mid-task) used to count
  // toward `resolved` without appearing in succeeded/failed/abstained anywhere —
  // so those three no longer summed to `resolved`, and a reader had no way to see
  // where the missing count went. This asserts the fixed invariant directly.
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('unknown-outcome');
  try {
    await seedTasks(user.id, adapter, [
      { status: 'submitted' },
      { status: 'failed', failureClass: 'NETWORK' },
      { status: 'unknown_outcome', failureReason: 'process crashed mid-task' },
      { status: 'unknown_outcome', failureReason: 'process crashed mid-task' },
    ]);

    const report = await runApplyBotFailureReport();
    const stats = report.perAdapterBreakdown[adapter];

    assert.equal(stats.resolved, 4);
    assert.equal(stats.succeeded, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.abstained, 0);
    assert.equal(stats.unknownOutcome, 2, 'unknown_outcome must be tracked as its own explicit category');
    assert.equal(
      stats.succeeded + stats.failed + stats.abstained + stats.unknownOutcome,
      stats.resolved,
      'every resolved task must be accounted for in exactly one of these four buckets'
    );
  } finally {
    await cleanup(user.id, startedAt);
  }
});

test('an adapter with only in-flight tasks reports null, not 0%', { skip: skipReason }, async () => {
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('inflight');
  try {
    await seedTasks(user.id, adapter, [{ status: 'queued' }, { status: 'running' }]);

    const report = await runApplyBotFailureReport();
    const stats = report.perAdapterBreakdown[adapter];

    assert.equal(stats.resolved, 0);
    // "no data yet" and "0% success" are different answers — collapsing them would
    // make the report actively misleading (it would look like a broken adapter).
    assert.equal(stats.successRate, null);
  } finally {
    await cleanup(user.id, startedAt);
  }
});

test('tasks older than the window are excluded', { skip: skipReason }, async () => {
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('window');
  try {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await seedTasks(user.id, adapter, [
      { status: 'submitted' },
      { status: 'failed', failureClass: 'AUTH', createdAt: tenDaysAgo },
    ]);

    const sevenDays = await runApplyBotFailureReport({ windowDays: 7 });
    assert.equal(sevenDays.perAdapterBreakdown[adapter].resolved, 1, 'the 10-day-old row is outside a 7-day window');
    assert.equal(sevenDays.perAdapterBreakdown[adapter].successRate, 100);

    const thirtyDays = await runApplyBotFailureReport({ windowDays: 30 });
    assert.equal(thirtyDays.perAdapterBreakdown[adapter].resolved, 2, 'a 30-day window includes it');
    assert.equal(thirtyDays.perAdapterBreakdown[adapter].successRate, 50);
    assert.equal(thirtyDays.windowDays, 30);
  } finally {
    await cleanup(user.id, startedAt);
  }
});

test('failure-class breakdown counts each seeded class, and an unclassified failure is not dropped', { skip: skipReason }, async () => {
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('classes');
  try {
    // failureBreakdown is global (no adapter key to isolate on), so assert the
    // DELTA this seed causes rather than absolute counts.
    const before = (await runApplyBotFailureReport()).failureBreakdown;

    await seedTasks(user.id, adapter, [
      { status: 'failed', failureClass: 'PORTAL_LAYOUT' },
      { status: 'failed', failureClass: 'PORTAL_LAYOUT' },
      { status: 'failed', failureClass: 'CAPTCHA' },
      { status: 'failed' }, // failureClass is nullable — must be bucketed, not dropped
      { status: 'submitted' }, // not a failure — must not appear in the breakdown at all
    ]);

    const after = (await runApplyBotFailureReport()).failureBreakdown;
    const delta = (key) => (after[key] || 0) - (before[key] || 0);

    assert.equal(delta('PORTAL_LAYOUT'), 2);
    assert.equal(delta('CAPTCHA'), 1);
    assert.equal(delta('UNCLASSIFIED'), 1, 'a failed task with no failureClass is still visible');
  } finally {
    await cleanup(user.id, startedAt);
  }
});

test('each run persists a SchedulerLog row carrying the full report', { skip: skipReason }, async () => {
  const startedAt = new Date();
  const user = await makeUser();
  const adapter = uniqueAdapter('log');
  try {
    await seedTasks(user.id, adapter, [{ status: 'submitted' }]);

    const report = await runApplyBotFailureReport();

    const logRow = await prisma.schedulerLog.findFirst({
      where: { jobName: 'apply-bot-failure-report', ranAt: { gte: startedAt } },
      orderBy: { ranAt: 'desc' },
    });

    assert.ok(logRow, 'a SchedulerLog row should be written so the history is readable later');
    assert.equal(logRow.status, 'completed');
    assert.equal(logRow.jobCount, report.totals.resolved);
    assert.equal(logRow.sourceBreakdown.perAdapterBreakdown[adapter].succeeded, 1);
  } finally {
    await cleanup(user.id, startedAt);
  }
});

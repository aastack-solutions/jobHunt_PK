// F10 — applyBotSelect.js's selection safety rules.
//
// Why this file exists: a coverage run on 2026-08-19 put applyBotSelect.js at
// 16.98% line coverage — meaning the daily cap, the dedupe rules, the credential
// requirement and the F8 generic gate, i.e. every rule that stops the bot doing
// something it should not, had no automated test at all. F12 (live-mode rollout)
// is gated on exactly these being trustworthy.
//
// Targets selectForUser() rather than runApplyBotSelection(): the latter loops over
// EVERY user in the database, which no test can safely do against a shared one.
// Each test seeds its own throwaway user, so nothing here can touch real data.
//
// Requires DATABASE_URL — self-skips when absent, same as the other DB-dependent
// files, so `npm test` still passes clean in a plain checkout.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const hasDb = Boolean(process.env.DATABASE_URL);
const skipReason = hasDb ? false : 'requires DATABASE_URL (live database) — not set';

let prisma;
let selectForUser;
let applyBotQueue;

if (hasDb) {
  prisma = require('../src/db');
  ({ selectForUser } = require('../jobs/applyBotSelect'));
  applyBotQueue = require('../src/queues/applyBotQueue');
}

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser() {
  return prisma.user.create({
    data: { email: `select-test-${uniq()}@test.local`, passwordHash: 'x', fullName: 'Select Test User' },
  });
}

// Defaults to a plain Greenhouse posting; override applyUrl/company per test.
async function makeJob(overrides = {}) {
  const id = uniq();
  return prisma.job.create({
    data: {
      platform: 'greenhouse',
      externalId: `select-test-${id}`,
      contentHash: `select-test-hash-${id}`,
      title: 'Select Test Role',
      company: `Select Test Co ${id}`,
      locationType: 'Remote',
      applyUrl: `https://job-boards.greenhouse.io/selecttest/jobs/${Date.now()}`,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      ...overrides,
    },
  });
}

async function makeMatch(user, job, matchScore = 90) {
  return prisma.jobMatch.create({
    data: { userId: user.id, jobId: job.id, matchScore, locationType: job.locationType },
  });
}

async function giveCredential(user, platform = 'greenhouse') {
  return prisma.applyCredential.create({
    data: {
      userId: user.id,
      platform,
      // Dummy bytes rather than a real cryptoService.encryptJSON blob on purpose:
      // selectForUser only checks that an active credential row EXISTS, it never
      // decrypts. Encrypting for real would make these tests depend on
      // APPLY_BOT_MASTER_KEY and fail for a reason unrelated to what they assert.
      credentialEncrypted: Buffer.from('not-a-real-credential'),
      iv: Buffer.from('000000000000'),
      authTag: Buffer.from('0000000000000000'),
      isActive: true,
    },
  });
}

// Removes only the queue jobs this test enqueued, looked up by applyTaskId.
// Deliberately NOT queue.drain() — that would delete real waiting work too.
async function removeQueuedJobsFor(taskIds) {
  if (!taskIds.length) return;
  const wanted = new Set(taskIds);
  const jobs = await applyBotQueue.getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  for (const job of jobs) {
    if (wanted.has(job.data?.applyTaskId)) await job.remove().catch(() => {});
  }
}

async function cleanup(user, jobs) {
  const tasks = await prisma.applyTask.findMany({ where: { userId: user.id }, select: { id: true } });
  await removeQueuedJobsFor(tasks.map((t) => t.id));
  await prisma.applyTask.deleteMany({ where: { userId: user.id } });
  await prisma.application.deleteMany({ where: { userId: user.id } });
  await prisma.jobMatch.deleteMany({ where: { userId: user.id } });
  await prisma.applyCredential.deleteMany({ where: { userId: user.id } });
  for (const job of jobs) await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } });
}

// Runs a test body with a seeded user, guaranteeing cleanup even on failure.
async function withUser(fn) {
  const user = await makeUser();
  const jobs = [];
  try {
    return await fn(user, jobs);
  } finally {
    await cleanup(user, jobs);
  }
}

after(async () => {
  if (!hasDb) return;
  // The queue and Redis are opened by importing applyBotSelect; without closing
  // them the runner sits on live handles after the last assertion.
  await applyBotQueue.close().catch(() => {});
  const redis = require('../src/redis');
  if (redis.isOpen) await redis.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

test('the daily cap is an upper bound on tasks created in one run', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    for (let i = 0; i < 5; i += 1) {
      const job = await makeJob();
      jobs.push(job);
      await makeMatch(user, job, 90 - i);
    }

    const result = await selectForUser(user, 2, 'shadow');

    assert.equal(result.created, 2, '5 eligible matches, cap of 2 — must create exactly 2');
    assert.equal(await prisma.applyTask.count({ where: { userId: user.id } }), 2);
  });
});

test('a user who already hit the cap today gets nothing more', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob();
    jobs.push(job);
    await makeMatch(user, job);
    // Two tasks already created today, cap of 2 — no room left.
    await prisma.applyTask.createMany({
      data: [0, 1].map((i) => ({
        userId: user.id,
        applyUrl: `https://job-boards.greenhouse.io/selecttest/jobs/cap${i}`,
        adapterUsed: 'greenhouse',
        mode: 'shadow',
        status: 'shadow_complete',
      })),
    });

    const result = await selectForUser(user, 2, 'shadow');

    assert.equal(result.created, 0);
    assert.equal(result.reason, 'cap_reached');
  });
});

test('a job with an in-flight task is never selected again', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob();
    jobs.push(job);
    await makeMatch(user, job);
    // 'queued' counts as in flight — re-selecting would double-apply.
    await prisma.applyTask.create({
      data: { userId: user.id, jobId: job.id, applyUrl: job.applyUrl, adapterUsed: 'greenhouse', mode: 'shadow', status: 'queued' },
    });

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0, 'the only candidate is already in flight');
  });
});

test("an 'unknown_outcome' task blocks its job indefinitely, not just for the dedupe window", { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob();
    jobs.push(job);
    await makeMatch(user, job);
    // Set by applyBotSweep when the worker died mid-task: it may or may not have
    // submitted. Retrying risks a duplicate real application, so it must stay
    // blocked until a human resolves it — however old it is.
    await prisma.applyTask.create({
      data: {
        userId: user.id,
        jobId: job.id,
        applyUrl: job.applyUrl,
        adapterUsed: 'greenhouse',
        mode: 'shadow',
        status: 'unknown_outcome',
        createdAt: new Date(Date.now() - 365 * 86400000),
      },
    });

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0, 'a year-old unknown_outcome must still block re-selection');
  });
});

test('a company already applied to is skipped, even for a different job', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob({ company: `Dedupe Co ${uniq()}` });
    jobs.push(job);
    await makeMatch(user, job);
    await prisma.application.create({
      data: {
        userId: user.id,
        jobTitle: 'Something else entirely',
        company: job.company.toUpperCase(), // case/whitespace must not defeat the check
        locationType: 'Remote',
        status: 'applied',
        appliedAt: new Date(),
      },
    });

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0, 'one application per company within the dedupe window');
  });
});

test('a platform needing a credential is skipped when none is stored', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    const job = await makeJob(); // Greenhouse — requiresCredential() is true
    jobs.push(job);
    await makeMatch(user, job);

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0, 'no login on file — skip, never guess');
  });
});

test('an inactive credential counts as no credential', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    const credential = await giveCredential(user);
    await prisma.applyCredential.update({ where: { id: credential.id }, data: { isActive: false } });
    const job = await makeJob();
    jobs.push(job);
    await makeMatch(user, job);

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0);
  });
});

test('the F8 generic gate blocks non-ATS jobs while the flag is off, and lets them through when on', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    const job = await makeJob({ applyUrl: 'https://remotive.com/remote-jobs/some-select-test-job' });
    jobs.push(job);
    await makeMatch(user, job);

    const previous = process.env.APPLY_BOT_GENERIC_ENABLED;
    try {
      process.env.APPLY_BOT_GENERIC_ENABLED = 'false';
      assert.equal((await selectForUser(user, 10, 'shadow')).created, 0, 'gate closed — no generic task');

      process.env.APPLY_BOT_GENERIC_ENABLED = 'true';
      const opened = await selectForUser(user, 10, 'shadow');
      assert.equal(opened.created, 1, 'gate open — the same job is now eligible');
      const task = await prisma.applyTask.findFirst({ where: { userId: user.id } });
      assert.equal(task.adapterUsed, 'generic');
    } finally {
      if (previous === undefined) delete process.env.APPLY_BOT_GENERIC_ENABLED;
      else process.env.APPLY_BOT_GENERIC_ENABLED = previous;
    }
  });
});

test('an employer-hosted Greenhouse job is stored with the F8a rewritten navigation URL', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob({ applyUrl: 'https://www.coinbase.com/careers/positions/8054862?gh_jid=8054862' });
    jobs.push(job);
    await makeMatch(user, job);

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 1, 'gh_jid means Greenhouse, so the credential covers it');
    const task = await prisma.applyTask.findFirst({ where: { userId: user.id } });
    assert.equal(task.adapterUsed, 'greenhouse');
    assert.equal(task.applyUrl, 'https://boards.greenhouse.io/embed/job_app?token=8054862');
    // The human-facing link is the employer's page and must stay untouched.
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).applyUrl, job.applyUrl);
  });
});

test('a non-https applyUrl is refused outright', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob({ applyUrl: 'http://job-boards.greenhouse.io/selecttest/jobs/insecure' });
    jobs.push(job);
    await makeMatch(user, job);

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0, 'plain http must never be navigated to');
  });
});

test('an inactive job is never selected', { skip: skipReason }, async () => {
  await withUser(async (user, jobs) => {
    await giveCredential(user);
    const job = await makeJob({ isActive: false });
    jobs.push(job);
    await makeMatch(user, job);

    const result = await selectForUser(user, 10, 'shadow');

    assert.equal(result.created, 0);
  });
});

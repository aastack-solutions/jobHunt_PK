// jobs/applyBotSelect.js — runApplyBotSelection(): picks each user's top matches,
// filters out anything unsafe/duplicate/already-attempted, creates an ApplyTask row
// per survivor, and enqueues it on applyBotQueue for the apply-bot service to pick up.
//
// Kept as its OWN step (not folded into dailyJobFetch.js) so the whole feature is
// trivially disable-able and so it always reads a fully up-to-date JobMatch table.
// Phase 1: manually triggered only (see routes/internal.js) — not yet wired into the
// daily scheduler.
const prisma = require('../src/db');
const redisClient = require('../src/redis');
const logger = require('../src/logger');
const applyBotQueue = require('../src/queues/applyBotQueue');
const { resolvePlatform, requiresCredential } = require('../src/services/applyBotPlatform');
const { sweepStaleApplyTasks } = require('./applyBotSweep');

const DEFAULT_DAILY_CAP = 25;
const COMPANY_DEDUPE_DAYS = 90;
const CANDIDATE_BUFFER_MULTIPLIER = 3; // over-fetch matches since many get filtered out

const KILL_SWITCH_KEY = 'apply_bot:enabled';

async function isEnabled() {
  const flag = await redisClient.get(KILL_SWITCH_KEY).catch(() => null);
  if (flag !== null) return flag === 'true';
  // No Redis override set yet — fall back to the env var default at boot.
  return process.env.APPLY_BOT_ENABLED === 'true';
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function selectForUser(user, cap, mode) {
  const todaysCount = await prisma.applyTask.count({
    where: { userId: user.id, createdAt: { gte: startOfToday() } },
  });
  const remaining = cap - todaysCount;
  if (remaining <= 0) {
    return { userId: user.id, created: 0, reason: 'cap_reached' };
  }

  const dedupeSince = new Date(Date.now() - COMPANY_DEDUPE_DAYS * 24 * 60 * 60 * 1000);
  const [recentApplications, recentTasks] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, appliedAt: { gte: dedupeSince } },
      select: { jobId: true, company: true },
    }),
    // 'unknown_outcome' (applyBotSweep.js) is included WITHOUT the dedupeSince/
    // recency limit other statuses implicitly get via this query — see below. It
    // means "we don't know if this already got submitted," so it must block
    // re-selection indefinitely, not just for the same dedupe window as a normal
    // application, until a human resolves it.
    prisma.applyTask.findMany({
      where: { userId: user.id, status: { in: ['queued', 'running', 'paused_human', 'submitted', 'shadow_complete', 'unknown_outcome'] } },
      select: { jobId: true },
    }),
  ]);
  const appliedJobIds = new Set(recentApplications.map((a) => a.jobId).filter(Boolean));
  const appliedCompanies = new Set(recentApplications.map((a) => a.company.toLowerCase().trim()));
  const inFlightJobIds = new Set(recentTasks.map((t) => t.jobId).filter(Boolean));

  const matches = await prisma.jobMatch.findMany({
    where: { userId: user.id },
    orderBy: { matchScore: 'desc' },
    take: remaining * CANDIDATE_BUFFER_MULTIPLIER,
    include: { job: true },
  });

  let created = 0;
  for (const match of matches) {
    if (created >= remaining) break;
    const job = match.job;
    if (!job || !job.isActive) continue;
    if (appliedJobIds.has(job.id) || inFlightJobIds.has(job.id)) continue;
    if (appliedCompanies.has(job.company.toLowerCase().trim())) continue;
    if (!job.applyUrl || !job.applyUrl.startsWith('https://')) continue;

    const platform = resolvePlatform(job.applyUrl);
    // Phase 1 scope: only the known-ATS adapters (Greenhouse/Lever/Ashby) are built.
    // The generic engine is Phase 2 — gated behind its own flag so "generic" jobs
    // aren't silently queued against an adapter that doesn't exist yet.
    if (platform === 'generic' && process.env.APPLY_BOT_GENERIC_ENABLED !== 'true') continue;
    if (requiresCredential(platform)) {
      const credential = await prisma.applyCredential.findUnique({
        where: { userId_platform: { userId: user.id, platform } },
      });
      if (!credential || !credential.isActive) continue; // no login on file — skip, don't guess
    }

    const task = await prisma.applyTask.create({
      data: {
        userId: user.id,
        jobId: job.id,
        applyUrl: job.applyUrl,
        adapterUsed: platform,
        mode,
        status: 'queued',
      },
    });
    await applyBotQueue.add('apply', { applyTaskId: task.id });
    created += 1;
  }

  return { userId: user.id, created };
}

async function runApplyBotSelection() {
  // Runs even if the kill switch is off — cleaning up stale tasks from BEFORE the
  // feature was disabled is still correct, and it's what keeps the dedupe logic in
  // selectForUser() trustworthy the moment the switch is flipped back on.
  const swept = await sweepStaleApplyTasks();

  if (!(await isEnabled())) {
    logger.info('apply-bot-select: kill switch is off, skipping selection (sweep still ran).');
    return { enabled: false, users: 0, created: 0, swept };
  }

  const cap = parseInt(process.env.APPLY_BOT_DAILY_CAP || String(DEFAULT_DAILY_CAP), 10);
  const mode = process.env.APPLY_BOT_MODE === 'live' ? 'live' : 'shadow'; // default to shadow — safest

  const users = await prisma.user.findMany();
  let created = 0;
  for (const user of users) {
    const result = await selectForUser(user, cap, mode);
    created += result.created;
  }

  await prisma.schedulerLog.create({
    data: { jobName: 'apply-bot-select', status: 'completed', jobCount: created },
  });
  logger.info(`apply-bot-select: created ${created} ApplyTask(s) across ${users.length} user(s), mode=${mode}`);
  return { enabled: true, users: users.length, created, mode, swept };
}

module.exports = { runApplyBotSelection, isEnabled, KILL_SWITCH_KEY };

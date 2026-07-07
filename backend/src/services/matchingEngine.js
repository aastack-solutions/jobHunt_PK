// services/matchingEngine.js — isEligible() + calculateMatch() + orchestration.
// Scoring values are pinned by backend/CLAUDE.md and the spec:
//   Final = Skill×0.55 + Experience×0.30 + Salary×0.15
const prisma = require('../db');
const redisClient = require('../redis');
const logger = require('../logger');
const { toUSD } = require('./currencyService');

// ---- Stage 1: location eligibility (hard filter, runs before any scoring) ----
function isEligible(job, user) {
  if (job.locationType === 'Remote') return user.wantsRemote === true;
  if (job.locationType === 'Onsite' || job.locationType === 'Hybrid') {
    return user.wantsOnsiteKarachi === true && job.city === 'karachi';
  }
  return false;
}

// ---- Stage 2: scoring sub-factors ----

// Skill (55%): no user skills → 0 (warn) | no job skills → 60 | else matched/total×100
function computeSkill(userSkills, jobSkills) {
  if (!userSkills || userSkills.length === 0) return { score: 0, matched: [], warn: true };
  if (!jobSkills || jobSkills.length === 0) return { score: 60, matched: [], warn: false };
  const have = new Set(userSkills.map((s) => String(s).toLowerCase().trim()));
  const matched = jobSkills.filter((s) => have.has(String(s).toLowerCase().trim()));
  return { score: Math.round((matched.length / jobSkills.length) * 100), matched, warn: false };
}

// Pull a required-years number from the job text (no dedicated field exists).
function extractRequiredYears(job) {
  const text = `${job.title || ''} ${job.description || ''}`;
  const m = text.match(/(\d{1,2})\s*\+?\s*years?/i);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) && y >= 0 && y <= 40 ? y : null;
}

// Experience (30%): none→70 | meets→100 | 1 short→75 | 2 short→50 | 3+ short→decline, floor 10
function computeExperience(userYears, requiredYears) {
  if (requiredYears == null) return 70;
  const gap = requiredYears - (userYears || 0);
  if (gap <= 0) return 100;
  if (gap === 1) return 75;
  if (gap === 2) return 50;
  return Math.max(10, 50 - (gap - 2) * 15);
}

// Salary (15%): unknown→70 | job≥user→100 | ≤10%→80 | ≤25%→55 | ≤40%→35 | >40% below→15
async function computeSalary(job, user) {
  const jobMin = await toUSD(job.salaryMin, job.salaryCurrency, redisClient);
  const userMin = await toUSD(user.salaryMin, user.salaryCurrency, redisClient);
  if (jobMin == null || !userMin) return 70; // either unknown / rate unavailable
  if (jobMin >= userMin) return 100;
  const shortfall = (userMin - jobMin) / userMin;
  if (shortfall <= 0.1) return 80;
  if (shortfall <= 0.25) return 55;
  if (shortfall <= 0.4) return 35;
  return 15;
}

async function calculateMatch(job, user, resume) {
  const skill = computeSkill(resume?.skills, job.skills);
  const experience = computeExperience(resume?.experienceYears, extractRequiredYears(job));
  const salary = await computeSalary(job, user);
  const matchScore = Math.round(skill.score * 0.55 + experience * 0.3 + salary * 0.15);
  return {
    matchScore,
    skillScore: skill.score,
    experienceScore: experience,
    salaryScore: salary,
    matchedSkills: skill.matched,
    skillWarn: skill.warn,
  };
}

// Build the JobMatch rows for one user against a set of jobs (eligible only).
async function buildMatchesForUser(user, jobs, resume) {
  const rows = [];
  for (const job of jobs) {
    if (!isEligible(job, user)) continue;
    const m = await calculateMatch(job, user, resume);
    rows.push({
      userId: user.id,
      jobId: job.id,
      locationType: job.locationType, // denormalized — never join to read this
      matchScore: m.matchScore,
      skillScore: m.skillScore,
      experienceScore: m.experienceScore,
      salaryScore: m.salaryScore,
      matchedSkills: m.matchedSkills,
    });
  }
  return rows;
}

async function activeResumeFor(userId) {
  return prisma.resume.findFirst({
    where: { userId, isActive: true },
    orderBy: { uploadedAt: 'desc' },
  });
}

// Delta matching — score only jobs fetched since the last run, for every user.
// Called after the daily fetch inserts new listings.
async function matchNewJobs() {
  const tsRaw = await redisClient.get('last_match_run').catch(() => null);
  const since = tsRaw ? new Date(parseInt(tsRaw, 10)) : null;
  const jobs = await prisma.job.findMany({
    where: { isActive: true, ...(since ? { fetchedAt: { gt: since } } : {}) },
  });
  await redisClient.set('last_match_run', Date.now().toString());
  if (!jobs.length) return { created: 0, jobs: 0, users: 0 };

  const users = await prisma.user.findMany();
  let created = 0;
  for (const user of users) {
    const resume = await activeResumeFor(user.id);
    const rows = await buildMatchesForUser(user, jobs, resume);
    if (rows.length) {
      const r = await prisma.jobMatch.createMany({ data: rows, skipDuplicates: true });
      created += r.count;
    }
  }
  logger.info(`matching: ${created} new matches across ${users.length} users / ${jobs.length} new jobs`);
  return { created, jobs: jobs.length, users: users.length };
}

// Full re-match for one user — used when their resume or preferences change.
// Wipes their JobMatch rows and rebuilds against all active jobs.
async function rematchUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { created: 0 };
  const [resume, jobs] = await Promise.all([
    activeResumeFor(userId),
    prisma.job.findMany({ where: { isActive: true } }),
  ]);
  const rows = await buildMatchesForUser(user, jobs, resume);
  await prisma.jobMatch.deleteMany({ where: { userId } });
  if (rows.length) await prisma.jobMatch.createMany({ data: rows, skipDuplicates: true });
  logger.info(`matching: re-matched user ${userId} → ${rows.length} matches`);
  return { created: rows.length };
}

module.exports = {
  isEligible,
  calculateMatch,
  extractRequiredYears,
  matchNewJobs,
  rematchUser,
};

// /api/jobs — the user's matched jobs, read from their JobMatch rows (produced by
// the matching engine). Eligibility is already baked into JobMatch: a row exists
// only for jobs the user is eligible for, so browsing never leaks ineligible jobs.
// locationType is read from the denormalized JobMatch column (never joined).
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const filtersSchema = z.object({
  locationType: z.enum(['Remote', 'Onsite', 'Hybrid']).optional(),
  platform: z.string().min(1).max(50).optional(),
  q: z.string().min(1).max(100).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(['recent', 'score', 'distance']).optional(),
  // Freshness: keep only jobs posted within N days (fetchedAt is the fallback when
  // a source didn't provide a post date). Omit for the full 30-day pool.
  postedWithinDays: z.coerce.number().int().min(1).max(90).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Merge a JobMatch row with its Job into the shape the frontend expects.
function toClientJob(match) {
  return {
    ...match.job,
    matchScore: match.matchScore,
    matchedSkills: match.matchedSkills,
    skillScore: match.skillScore,
    experienceScore: match.experienceScore,
    salaryScore: match.salaryScore,
    distanceKm: match.distanceKm,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { locationType, platform, q, minScore, sort, postedWithinDays, limit } = parsed.data;

  const jobWhere = { isActive: true, expiresAt: { gt: new Date() } };
  if (platform) jobWhere.platform = platform;
  // Multiple OR groups (search + freshness) must be AND-ed, not overwrite each other.
  const jobAnd = [];
  if (q) {
    jobAnd.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (postedWithinDays) {
    const cutoff = new Date(Date.now() - postedWithinDays * 24 * 60 * 60 * 1000);
    jobAnd.push({
      OR: [
        { postedAt: { gte: cutoff } },
        { postedAt: null, fetchedAt: { gte: cutoff } }, // unknown post date → use fetch date
      ],
    });
  }
  if (jobAnd.length) jobWhere.AND = jobAnd;

  const where = { userId: req.session.userId, job: jobWhere };
  if (locationType) where.locationType = locationType; // denormalized column
  if (minScore) where.matchScore = { gte: minScore };

  let orderBy;
  if (sort === 'distance') orderBy = [{ distanceKm: 'asc' }, { matchScore: 'desc' }];
  else if (sort === 'recent') {
    orderBy = [{ job: { postedAt: { sort: 'desc', nulls: 'last' } } }, { matchScore: 'desc' }];
  } else orderBy = [{ matchScore: 'desc' }];

  const matches = await prisma.jobMatch.findMany({
    where,
    include: { job: true },
    orderBy,
    take: limit || 100,
  });

  return res.json(matches.map(toClientJob));
});

router.get('/:id', requireAuth, async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || !job.isActive) return res.status(404).json({ error: 'Job not found' });

  const match = await prisma.jobMatch.findUnique({
    where: { userId_jobId: { userId: req.session.userId, jobId: job.id } },
  });

  return res.json({
    ...job,
    matchScore: match?.matchScore ?? null,
    matchedSkills: match?.matchedSkills ?? [],
    skillScore: match?.skillScore ?? null,
    experienceScore: match?.experienceScore ?? null,
    salaryScore: match?.salaryScore ?? null,
    distanceKm: match?.distanceKm ?? null,
  });
});

module.exports = router;

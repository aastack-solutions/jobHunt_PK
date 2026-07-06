// /api/jobs — browse the jobs table. Location eligibility is applied as a hard
// filter (spec §Job Matching): Remote passes when the user wants remote; Onsite/
// Hybrid pass only when the user opted into Karachi AND city === 'karachi'.
//
// matchScore / distance sorting arrive in Week 4 with the matching engine; until
// then jobs sort by most-recently-fetched and carry a null score.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const filtersSchema = z.object({
  locationType: z.enum(['Remote', 'Onsite', 'Hybrid']).optional(),
  platform: z.string().min(1).max(50).optional(),
  q: z.string().min(1).max(100).optional(),
  sort: z.enum(['recent', 'score', 'distance']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Hard eligibility filter from the user's preferences. Week 4 moves this into
// per-user JobMatch rows; the browsing rule stays identical.
function eligibilityClause(user) {
  const or = [];
  if (user.wantsRemote) or.push({ locationType: 'Remote' });
  if (user.wantsOnsiteKarachi) or.push({ locationType: { in: ['Onsite', 'Hybrid'] }, city: 'karachi' });
  return or;
}

router.get('/', requireAuth, async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { locationType, platform, q, limit } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const eligible = eligibilityClause(user);
  if (eligible.length === 0) return res.json([]); // user wants neither pool

  const where = {
    isActive: true,
    expiresAt: { gt: new Date() },
    OR: eligible,
  };
  if (locationType) where.locationType = locationType;
  if (platform) where.platform = platform;
  if (q) {
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { fetchedAt: 'desc' },
    take: limit || 100,
  });

  return res.json(jobs);
});

router.get('/:id', requireAuth, async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || !job.isActive) return res.status(404).json({ error: 'Job not found' });
  // matchScore + distanceKm arrive with the matching engine (Week 4).
  return res.json({ ...job, matchScore: null, distanceKm: null });
});

module.exports = router;

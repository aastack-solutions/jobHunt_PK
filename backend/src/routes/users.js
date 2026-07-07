// /api/users/* — preference updates.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { rematchUser } = require('../services/matchingEngine');

const router = express.Router();

// Preference fields that change eligibility/scoring and thus require a re-match.
const MATCH_AFFECTING = ['wantsRemote', 'wantsOnsiteKarachi', 'salaryMin', 'salaryMax', 'salaryCurrency'];

// All fields optional — this is a partial update (PATCH).
const preferencesSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    wantsRemote: z.boolean().optional(),
    wantsOnsiteKarachi: z.boolean().optional(),
    homeArea: z.string().nullable().optional(),
    salaryMin: z.number().int().nonnegative().nullable().optional(),
    salaryMax: z.number().int().nonnegative().nullable().optional(),
    salaryCurrency: z.enum(['USD', 'PKR']).optional(),
  })
  .strict();

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

router.patch('/me/preferences', requireAuth, async (req, res) => {
  const result = preferencesSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  const updated = await prisma.user.update({
    where: { id: req.session.userId },
    data: result.data,
  });

  // Re-match immediately when a preference that affects eligibility or scoring
  // changed, so the Jobs list reflects the toggle right away.
  // (homeArea geocoding for distance sort arrives in a later week.)
  if (MATCH_AFFECTING.some((k) => k in result.data)) {
    await rematchUser(updated.id);
  }

  return res.json(publicUser(updated));
});

module.exports = router;

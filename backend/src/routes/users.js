// /api/users/* — preference updates.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

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

  // Note: homeArea geocoding (homeLat/homeLng) and delta re-matching are
  // wired up in a later week; this week we persist the raw preferences.
  const updated = await prisma.user.update({
    where: { id: req.session.userId },
    data: result.data,
  });

  return res.json(publicUser(updated));
});

module.exports = router;

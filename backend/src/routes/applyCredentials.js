// /api/apply-credentials — CRUD for the per-user, per-platform logins the apply-bot
// uses (e.g. a Greenhouse/Lever account the user created ahead of time). Secrets are
// encrypted at rest (cryptoService.js) and NEVER returned to the client after creation
// — this endpoint only ever echoes back which platforms are configured, not the values.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const cryptoService = require('../services/cryptoService');

const router = express.Router();

const PLATFORMS = ['greenhouse', 'lever', 'ashby', 'generic'];

const upsertSchema = z
  .object({
    platform: z.enum(PLATFORMS),
    loginUrl: z.string().url().optional(),
    username: z.string().min(1).max(300),
    password: z.string().min(1).max(500),
  })
  .strict();

function publicCredential(c) {
  // Never include usernameEncrypted/passwordEncrypted/iv/authTag/sessionStateEncrypted.
  return {
    id: c.id,
    platform: c.platform,
    loginUrl: c.loginUrl,
    isActive: c.isActive,
    hasSessionState: Boolean(c.sessionStateEncrypted),
    sessionStateSavedAt: c.sessionStateSavedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const credentials = await prisma.applyCredential.findMany({
    where: { userId: req.session.userId },
    orderBy: { platform: 'asc' },
  });
  return res.json(credentials.map(publicCredential));
});

// Create or replace the credential for a platform (one per user+platform).
router.put('/:platform', requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse({ ...req.body, platform: req.params.platform });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { platform, loginUrl, username, password } = parsed.data;

  const { ciphertext, iv, authTag } = cryptoService.encryptJSON({ username, password });
  const packed = { credentialEncrypted: ciphertext, iv, authTag };

  const credential = await prisma.applyCredential.upsert({
    where: { userId_platform: { userId: req.session.userId, platform } },
    create: {
      userId: req.session.userId,
      platform,
      loginUrl: loginUrl || null,
      ...packed,
      isActive: true,
    },
    update: {
      loginUrl: loginUrl || null,
      ...packed,
      isActive: true,
      // A new login invalidates any previously-saved session cookies.
      sessionStateEncrypted: null,
      sessionStateSavedAt: null,
    },
  });
  return res.status(201).json(publicCredential(credential));
});

router.delete('/:platform', requireAuth, async (req, res) => {
  const platform = req.params.platform;
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });

  const existing = await prisma.applyCredential.findUnique({
    where: { userId_platform: { userId: req.session.userId, platform } },
  });
  if (!existing) return res.status(404).json({ error: 'Credential not found' });

  await prisma.applyCredential.delete({ where: { id: existing.id } });
  return res.status(204).send();
});

module.exports = router;

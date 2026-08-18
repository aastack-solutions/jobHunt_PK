// emailIntegration.js (F14) — Gmail OAuth connect/callback for automated
// application-status detection. See docs/apply-bot/TECHNICAL_PLAN.md F14 for the
// full spec, and MEMORY.md's 2026-08-17 entry for the CASA/scope-tier research
// this is built around.
//
// STATUS: scaffolded, not implemented, NOT wired into app.js. Do not mount this
// router or migrate the EmailIntegration model (schema.prisma, currently commented
// out) until the team has explicitly signed off — this is the most privacy-
// sensitive integration in the project (reads the user's email inbox) and needs a
// real Google Cloud OAuth app registered first, which is a console step, not
// something this code can do.
//
// CRITICAL, non-obvious requirement before this ever goes live: the Google Cloud
// Console OAuth app MUST stay in "Testing" publishing status with each real user
// added individually as a named test user. Moving it to "Production" triggers
// Google's CASA security-assessment requirement for restricted scopes
// (gmail.readonly) — $500-$4,500/year, recurring. This project's actual scale
// (2-5 users) fits inside the Testing-mode exemption cleanly; don't accidentally
// leave the app in Production mode.
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
// const { google } = require('googleapis'); // TODO(F14): add as a new pinned
// dependency in package.json + backend/CLAUDE.md when this is implemented — not
// added yet, since nothing here is real code until the OAuth app exists.

const router = express.Router();

// TODO(F14): required env vars once implemented — GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI. Add startup validation for
// these in app.js's validateEnv(), same pattern as every other required var.

router.get('/connect', requireAuth, async (req, res) => {
  // TODO(F14): build the Google OAuth consent URL requesting `gmail.readonly`
  // (needed for message body/snippet text, not just headers — see F14's spec for
  // why gmail.metadata isn't enough) and redirect the user to it. Include
  // req.session.userId in the OAuth `state` parameter so /callback below knows
  // which user to attach the resulting tokens to.
  return res.status(501).json({ error: 'Not implemented — see docs/apply-bot/TECHNICAL_PLAN.md F14' });
});

router.get('/callback', requireAuth, async (req, res) => {
  // TODO(F14): exchange the authorization code for tokens, encrypt the refresh
  // token via cryptoService.js's existing AES-256-GCM scheme (reuse it — don't
  // build a second encryption scheme), and store it on a new EmailIntegration row
  // (userId, provider: 'gmail', refreshTokenEncrypted, iv, authTag, connectedAt,
  // isActive: true). Never log the raw token, even at debug level.
  return res.status(501).json({ error: 'Not implemented — see docs/apply-bot/TECHNICAL_PLAN.md F14' });
});

router.delete('/disconnect', requireAuth, async (req, res) => {
  // TODO(F14): delete or invalidate the stored EmailIntegration row for
  // req.session.userId — this is one of TEST_PLAN.md's F14 acceptance criteria
  // ("disconnecting deletes/invalidates the stored refresh token").
  return res.status(501).json({ error: 'Not implemented — see docs/apply-bot/TECHNICAL_PLAN.md F14' });
});

module.exports = router;

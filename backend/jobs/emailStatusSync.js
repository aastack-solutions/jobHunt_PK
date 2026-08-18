// emailStatusSync.js (F14) — periodic sync job, mirrors the shape of
// dailyJobFetch.js / applyBotSelect.js. See docs/apply-bot/TECHNICAL_PLAN.md F14.
//
// STATUS: scaffolded, not implemented. Depends on emailIntegration.js's OAuth flow
// actually existing (nothing to sync without a stored, active EmailIntegration).
// Not wired into any scheduler yet — see the "Technical approach" section below
// for what each step needs to do once F14 is greenlit.
const prisma = require('../src/db');
const logger = require('../src/logger');
// const cryptoService = require('../src/services/cryptoService'); // TODO(F14): decrypt the stored refresh token with this — reuse, don't reinvent

async function runEmailStatusSync() {
  // TODO(F14) step 1: fetch all EmailIntegration rows where isActive: true.
  const integrations = []; // = await prisma.emailIntegration.findMany({ where: { isActive: true } });

  let suggestionsCreated = 0;

  for (const integration of integrations) {
    // TODO(F14) step 2: decrypt the refresh token, exchange for a fresh access
    // token, query Gmail's messages.list with a `q` filter combining known
    // ATS/job-board sender domains and a recency window, e.g.:
    //   from:(greenhouse.io OR lever.co OR ashbyhq.com OR linkedin.com OR indeed.com) newer_than:3d
    // Track a `lastSyncAt` cursor (already a field on EmailIntegration) so the
    // same message is never processed twice.

    // TODO(F14) step 3: for each candidate message, enqueue a
    // 'classify_status_email' task on the EXISTING aiQueue/aiWorker (do not build a
    // second AI queue) — classification returns { stage, confidence, matchedCompany }.

    // TODO(F14) step 4: match matchedCompany against the user's existing
    // Application rows (same normalization applyBotSelect.js's dedupe already
    // uses) within a reasonable window of that application's appliedAt. Explicitly
    // OUT OF SCOPE for this job to create a NEW Application from an email alone —
    // only ever propose updating an existing, already-confirmed row.

    // TODO(F14) step 5 — REQUIRED, not optional: never silently change
    // Application.status here. Land the detected change as a pending suggestion
    // (see F14's spec for the two options considered: a new audit-row table, or a
    // lightweight status overlay) that the user approves with one click. This is
    // the one place in this entire codebase where "fully autonomous" is
    // deliberately NOT the design — a wrong guess here actively misleads the user
    // about their own job search, unlike an extra auto-applied application, which
    // is merely wasteful.

    logger.info(`emailStatusSync: (stub) would have synced integration ${integration.id}`);
  }

  logger.info(`emailStatusSync: ${suggestionsCreated} suggestion(s) created across ${integrations.length} integration(s)`);
  return { integrations: integrations.length, suggestionsCreated };
}

module.exports = { runEmailStatusSync };

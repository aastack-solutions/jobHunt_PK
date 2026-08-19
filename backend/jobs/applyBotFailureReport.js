// applyBotFailureReport.js (F9) — turns docs/apply-bot/03-failure-measurement.md's
// manual queries into something that runs on its own. Filename decision made
// 2026-08-17 (previously unnamed in the plan).
//
// STATUS: scaffolded, not implemented, not wired into any scheduler.
//
// Per F9's "Technical approach": start with the cheapest version — log the
// breakdown via Winston after each applyBotSelect.js run. Only build an actual
// dashboard section once there's enough real ApplyTask volume for it to be more
// useful than reading logs.
const prisma = require('../src/db');
const logger = require('../src/logger');

async function runApplyBotFailureReport() {
  // TODO(F9): these three queries are already fully specified in
  // docs/apply-bot/03-failure-measurement.md — this function just needs to
  // actually run them and log/store the result. Copying the intended shape here
  // so the queries and this stub don't drift apart:

  // 1. Overall success rate: submitted+shadow_complete / everything resolved
  //   (exclude queued/running/paused_human — they haven't resolved yet).
  const successRate = null; // TODO: prisma.applyTask.count() x2, compute the ratio

  // 2. Failure-class breakdown — the single most useful query, tells you WHERE
  //    the problem is (PORTAL_LAYOUT = selector drift, AUTH = stale credential,
  //    CAPTCHA = expected on Greenhouse, etc.), not just THAT something failed.
  const failureBreakdown = null;
  // TODO: prisma.applyTask.groupBy({ by: ['failureClass'], where: { status: 'failed' }, _count: true })

  // 3. Per-adapter success rate — answers "which of Lever/Greenhouse/Ashby needs
  //    selector maintenance right now."
  const perAdapterBreakdown = null;
  // TODO: prisma.applyTask.groupBy({ by: ['adapterUsed', 'status'], _count: true })

  logger.info('applyBotFailureReport: (stub) not yet computing real numbers — see docs/apply-bot/03-failure-measurement.md');
  return { successRate, failureBreakdown, perAdapterBreakdown };
}

module.exports = { runApplyBotFailureReport };

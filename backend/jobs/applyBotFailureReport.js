// applyBotFailureReport.js (F9) — turns docs/apply-bot/03-failure-measurement.md's
// manual queries into something that runs on its own. Filename decision made
// 2026-08-17 (previously unnamed in the plan).
//
// STATUS: implemented 2026-08-19 (F9's remaining half). Runs automatically at the
// end of every applyBotSelect.js run, and on demand via `node jobs/applyBotFailureReport.js`.
//
// Per F9's "Technical approach": the cheapest version that works — compute the
// breakdown, log it via Winston, and persist it as a SchedulerLog row so the
// history is queryable later. Deliberately NO dashboard UI yet: docs/apply-bot/03
// says not to build alert UI before there's enough real volume to calibrate
// thresholds against, so the ">50% failure rate" alert below is a logger.warn,
// not a banner.
const prisma = require('../src/db');
const logger = require('../src/logger');

// A task in one of these hasn't resolved yet, so it belongs in neither the
// numerator nor the denominator of a success rate (docs/apply-bot/03 §1).
const IN_FLIGHT_STATUSES = ['queued', 'running', 'paused_human'];
// 'shadow_complete' counts as success on purpose: in shadow mode a completed run
// IS the successful outcome — there's no real submission to wait for (§03 §1).
const SUCCESS_STATUSES = ['submitted', 'shadow_complete'];

// "what's our Greenhouse success rate this week" — F9's definition of done.
const DEFAULT_WINDOW_DAYS = 7;
// docs/apply-bot/03's suggested alert: per-adapter failure rate > 50%. The minimum
// sample size is what keeps a single early failure from firing the alert — the doc
// frames it as "over the last 20 attempts", i.e. don't judge an adapter on 2 runs.
const FAILURE_RATE_ALERT_THRESHOLD = 0.5;
const MIN_RESOLVED_FOR_ALERT = 20;

// Percentage rounded to one decimal, or null when there's nothing resolved to
// divide by. null, not 0 — "no data yet" and "0% success" are very different
// answers and collapsing them would make the report actively misleading.
function rate(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

async function runApplyBotFailureReport({ windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // One groupBy answers docs/apply-bot/03 §1 AND §5 — the overall rate is just the
  // per-adapter rows summed. Two queries total rather than one per adapter.
  const byAdapterStatus = await prisma.applyTask.groupBy({
    by: ['adapterUsed', 'status'],
    where: { createdAt: { gte: since } },
    _count: true,
  });

  // §4 — the failure-class breakdown: tells you WHERE the problem is
  // (PORTAL_LAYOUT = selector drift, AUTH = stale credential, CAPTCHA = expected
  // on Greenhouse, etc.) instead of one undifferentiated "failed" bucket.
  const byFailureClass = await prisma.applyTask.groupBy({
    by: ['failureClass'],
    where: { status: 'failed', createdAt: { gte: since } },
    _count: true,
  });

  const perAdapterBreakdown = {};
  for (const row of byAdapterStatus) {
    const adapter = (perAdapterBreakdown[row.adapterUsed] ||= {
      total: 0,
      resolved: 0,
      succeeded: 0,
      failed: 0,
      abstained: 0,
      // 'unknown_outcome' (a real, reachable status set by applyBotSweep.js when
      // the apply-bot process crashes mid-task) was previously neither in-flight
      // nor SUCCESS_STATUSES nor 'failed' nor 'skipped_low_confidence', so it
      // silently inflated `resolved` without ever appearing in the breakdown —
      // succeeded+failed+abstained no longer summed to resolved. Tracked here as
      // its own explicit category (see MEMORY.md's F9 entry) so the four buckets
      // always account for the full `resolved` count.
      unknownOutcome: 0,
      inFlight: 0,
      byStatus: {},
      successRate: null,
    });
    adapter.total += row._count;
    adapter.byStatus[row.status] = (adapter.byStatus[row.status] || 0) + row._count;

    if (IN_FLIGHT_STATUSES.includes(row.status)) {
      adapter.inFlight += row._count;
      continue;
    }
    adapter.resolved += row._count;
    if (SUCCESS_STATUSES.includes(row.status)) adapter.succeeded += row._count;
    if (row.status === 'failed') adapter.failed += row._count;
    if (row.status === 'skipped_low_confidence') adapter.abstained += row._count;
    if (row.status === 'unknown_outcome') adapter.unknownOutcome += row._count;
  }

  const totals = { total: 0, resolved: 0, succeeded: 0, failed: 0, abstained: 0, unknownOutcome: 0, inFlight: 0 };
  for (const adapter of Object.values(perAdapterBreakdown)) {
    adapter.successRate = rate(adapter.succeeded, adapter.resolved);
    // §2 — abstain rate. High is not automatically bad (the safety rail doing its
    // job); a RISING trend on a previously-fine adapter is the real signal.
    adapter.abstainRate = rate(adapter.abstained, adapter.resolved);
    for (const key of Object.keys(totals)) totals[key] += adapter[key];
  }

  const failureBreakdown = {};
  for (const row of byFailureClass) {
    // failureClass is nullable in the schema — a failed task with no class set is
    // itself worth seeing, so bucket it explicitly instead of dropping the row.
    failureBreakdown[row.failureClass || 'UNCLASSIFIED'] = row._count;
  }

  const successRate = rate(totals.succeeded, totals.resolved);
  const report = {
    windowDays,
    since: since.toISOString(),
    totals,
    successRate,
    abstainRate: rate(totals.abstained, totals.resolved),
    failureBreakdown,
    perAdapterBreakdown,
  };

  // The "& Alerting" half of F9, at the cheapest useful level. Warn-only by
  // design — see the file header on why this isn't a dashboard banner yet.
  for (const [name, adapter] of Object.entries(perAdapterBreakdown)) {
    if (adapter.resolved < MIN_RESOLVED_FOR_ALERT) continue;
    if (adapter.failed / adapter.resolved <= FAILURE_RATE_ALERT_THRESHOLD) continue;
    logger.warn(
      `apply-bot-failure-report: ${name} adapter failed ${adapter.failed}/${adapter.resolved} resolved task(s) ` +
        `(${rate(adapter.failed, adapter.resolved)}%) in the last ${windowDays}d — likely selector drift, check its failureClass breakdown.`
    );
  }

  const perAdapterSummary =
    Object.entries(perAdapterBreakdown)
      .map(([name, a]) => `${name} ${a.successRate === null ? 'n/a' : `${a.successRate}%`} (${a.succeeded}/${a.resolved})`)
      .join(', ') || 'no tasks in window';
  logger.info(
    `apply-bot-failure-report: last ${windowDays}d — overall ${successRate === null ? 'n/a' : `${successRate}%`} ` +
      `(${totals.succeeded}/${totals.resolved} resolved, ${totals.inFlight} in flight); per-adapter: ${perAdapterSummary}`
  );

  // Persisted so the history is readable later without re-running anything — same
  // SchedulerLog pattern dailyJobFetch/apply-bot-select already use, with the full
  // report in sourceBreakdown (the model's existing Json column, no schema change).
  await prisma.schedulerLog.create({
    data: {
      jobName: 'apply-bot-failure-report',
      status: 'completed',
      jobCount: totals.resolved,
      sourceBreakdown: report,
    },
  });

  return report;
}

// On-demand run: `node -r dotenv/config jobs/applyBotFailureReport.js [windowDays]`
// — this is the "without hand-writing a Prisma query each time" half of F9's
// definition of done.
if (require.main === module) {
  const windowDays = parseInt(process.argv[2] || String(DEFAULT_WINDOW_DAYS), 10);
  runApplyBotFailureReport({ windowDays })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      logger.error(`apply-bot-failure-report: failed — ${err.message}`);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}

module.exports = {
  runApplyBotFailureReport,
  IN_FLIGHT_STATUSES,
  SUCCESS_STATUSES,
  FAILURE_RATE_ALERT_THRESHOLD,
  MIN_RESOLVED_FOR_ALERT,
};

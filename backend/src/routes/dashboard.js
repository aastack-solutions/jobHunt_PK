// /api/dashboard — aggregated stats for the current user, split into the Remote
// and Karachi-onsite pools (the frontend also derives a Combined view). All counts
// come from the user's Application rows; locationType is the denormalized column.
const express = require('express');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { isGhosted } = require('../services/applicationHealth');

const router = express.Router();

// Positive pipeline order (rejected/withdrawn are terminal and sit outside it).
const PIPELINE = ['applied', 'viewed', 'phone_screen', 'interview', 'technical', 'offer'];
const FUNNEL_LABELS = ['Applied', 'Viewed', 'Phone Screen', 'Interview', 'Technical', 'Offer'];
const ORDER = Object.fromEntries(PIPELINE.map((s, i) => [s, i + 1]));

const DAY_MS = 24 * 60 * 60 * 1000;
const isRemote = (a) => a.locationType === 'Remote';
const isKarachi = (a) => a.locationType === 'Onsite' || a.locationType === 'Hybrid';

// Cumulative funnel: an app at positive stage N has reached stages 1..N. We only
// store the current status, so rejected/withdrawn apps are counted at "Applied"
// only (we don't know how far they progressed before dropping out).
function funnelFor(apps) {
  return PIPELINE.map((_, idx) => {
    const stage = idx + 1;
    return apps.filter((a) => {
      const ord = ORDER[a.status];
      return ord != null ? ord >= stage : stage === 1;
    }).length;
  });
}

// Four rolling 7-day buckets ending now (oldest → newest).
function weeklyFor(apps, now) {
  const buckets = [0, 0, 0, 0];
  for (const a of apps) {
    const ageDays = (now - new Date(a.appliedAt).getTime()) / DAY_MS;
    if (ageDays < 0 || ageDays >= 28) continue;
    const idx = 3 - Math.floor(ageDays / 7); // 0..6d → newest (idx 3)
    if (idx >= 0 && idx < 4) buckets[idx] += 1;
  }
  return buckets;
}

router.get('/', requireAuth, async (req, res) => {
  const now = Date.now();
  const apps = await prisma.application.findMany({ where: { userId: req.session.userId } });

  const remote = apps.filter(isRemote);
  const karachi = apps.filter(isKarachi);
  const total = apps.length;

  const reachedInterview = apps.filter((a) => (ORDER[a.status] || 0) >= ORDER.interview).length;
  const offers = apps.filter((a) => a.status === 'offer').length;
  const thisWeek = apps.filter((a) => now - new Date(a.appliedAt).getTime() < 7 * DAY_MS).length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  return res.json({
    stats: {
      totalApplications: total,
      thisWeek,
      interviewRate: pct(reachedInterview),
      offerRate: pct(offers),
      remoteCount: remote.length,
      karachiCount: karachi.length,
      autoAppliedCount: apps.filter((a) => a.source === 'auto_apply_bot').length,
      ghostedCount: apps.filter((a) => isGhosted(a, now)).length,
    },
    funnel: {
      labels: FUNNEL_LABELS,
      remote: funnelFor(remote),
      karachi: funnelFor(karachi),
    },
    weekly: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      remote: weeklyFor(remote, now),
      karachi: weeklyFor(karachi, now),
    },
    schedulerLog: {
      lastRunAt:
        (
          await prisma.schedulerLog.findFirst({
            where: { jobName: 'daily-job-fetch', status: 'completed' },
            orderBy: { ranAt: 'desc' },
          })
        )?.ranAt || null,
      // Only surfaced once it's actually run once — a team that hasn't enabled the
      // auto-apply bot yet shouldn't see a false "hasn't run in 25 hours" alarm.
      applyBotLastRunAt:
        (
          await prisma.schedulerLog.findFirst({
            where: { jobName: 'apply-bot-select', status: 'completed' },
            orderBy: { ranAt: 'desc' },
          })
        )?.ranAt || null,
    },
    // 'unknown_outcome' (see applyBotSweep.js) means the apply-bot process crashed
    // mid-task and the real outcome on the ATS site is unconfirmed — these need a
    // human to check manually and can never resolve themselves, so surfacing the
    // count is the whole point (silence here means something is quietly stuck).
    applyBotNeedsReview: await prisma.applyTask.count({
      where: { userId: req.session.userId, status: 'unknown_outcome' },
    }),
  });
});

module.exports = router;

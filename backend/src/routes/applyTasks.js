// /api/apply-tasks — read-only list of the current user's ApplyTask audit trail, for
// the AutoApply frontend page. Nothing here creates or mutates a task — creation is
// applyBotSelect.js, mutation is the apply-bot service's internal callback.
const express = require('express');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getDownloadUrl, isConfigured } = require('../services/storageService');

const router = express.Router();

function publicTask(t) {
  return {
    id: t.id,
    jobId: t.jobId,
    jobTitle: t.job?.title || null,
    company: t.job?.company || null,
    applyUrl: t.applyUrl,
    adapterUsed: t.adapterUsed,
    mode: t.mode,
    status: t.status,
    // F7 added this column; nothing exposed it until F11 needed it. It is what
    // tells the live-view which instructions to show (solve a CAPTCHA vs. fetch a
    // code from your inbox), so without it the UI can only ever say "something
    // needs attention".
    pauseReason: t.pauseReason,
    failureClass: t.failureClass,
    failureReason: t.failureReason,
    confidenceScore: t.confidenceScore,
    hasScreenshots: t.screenshotKeys.length > 0,
    captchaDetectedAt: t.captchaDetectedAt,
    captchaSolvedAt: t.captchaSolvedAt,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const tasks = await prisma.applyTask.findMany({
    where: { userId: req.session.userId },
    include: { job: { select: { title: true, company: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json(tasks.map(publicTask));
});

// Full audit detail for one task, including signed screenshot URLs.
router.get('/:id', requireAuth, async (req, res) => {
  const task = await prisma.applyTask.findFirst({
    where: { id: req.params.id, userId: req.session.userId },
    include: { job: { select: { title: true, company: true } } },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const screenshotUrls = isConfigured()
    ? await Promise.all(task.screenshotKeys.map((key) => getDownloadUrl(key)))
    : [];

  return res.json({
    ...publicTask(task),
    fieldsFilled: task.fieldsFilled,
    screenshotUrls,
  });
});

module.exports = router;

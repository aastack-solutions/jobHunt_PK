// /api/ai — enqueue an AI task and poll its status. Groq is never called from
// here; the route assembles the data server-side and enqueues to ai-tasks, and
// the worker (workers/aiWorker.js) does the generation.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const aiQueue = require('../queues/aiQueue');

const router = express.Router();

const enqueueSchema = z.object({
  type: z.enum(['cover_letter', 'job_summary', 'interview_prep']),
  payload: z.object({ jobId: z.string().min(1) }),
});

async function activeSkills(userId) {
  const resume = await prisma.resume.findFirst({
    where: { userId, isActive: true },
    orderBy: { uploadedAt: 'desc' },
  });
  return resume?.skills || [];
}

// Assemble the exact inputs each feature needs (spec §AI Features).
function buildTaskData(type, job, user, skills) {
  if (type === 'cover_letter') {
    return {
      type,
      jobTitle: job.title,
      company: job.company,
      descriptionSnippet: (job.description || '').slice(0, 600),
      userName: user.fullName,
      skills,
    };
  }
  if (type === 'job_summary') {
    return { type, description: job.description || '' };
  }
  // interview_prep
  return { type, jobTitle: job.title, company: job.company, skills };
}

router.post('/enqueue', requireAuth, async (req, res) => {
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { type, payload } = parsed.data;

  const [job, user, skills] = await Promise.all([
    prisma.job.findUnique({ where: { id: payload.jobId } }),
    prisma.user.findUnique({ where: { id: req.session.userId } }),
    activeSkills(req.session.userId),
  ]);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const data = buildTaskData(type, job, user, skills);
  const queueJob = await aiQueue.add(type, data);
  return res.status(202).json({ jobId: queueJob.id });
});

router.get('/status/:id', requireAuth, async (req, res) => {
  const job = await aiQueue.getJob(req.params.id);
  // Treat a missing job as a terminal failure so the client stops polling.
  if (!job) return res.json({ status: 'failed', result: null });

  const state = await job.getState();
  return res.json({
    status: state, // 'completed' | 'failed' | 'active' | 'waiting' | 'delayed'
    result: state === 'completed' ? job.returnvalue : null,
  });
});

module.exports = router;

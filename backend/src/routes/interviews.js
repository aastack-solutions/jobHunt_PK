// /api/interviews — schedule + track interviews. A 24h reminder email is sent by
// the interview-reminders job; rescheduling resets reminderSent so a fresh
// reminder goes out for the new time.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const TYPES = ['video', 'onsite', 'phone'];

const createSchema = z
  .object({
    applicationId: z.string().min(1).nullable().optional(),
    jobTitle: z.string().min(1).max(300),
    company: z.string().min(1).max(200),
    interviewType: z.enum(TYPES),
    scheduledAt: z.coerce.date(),
    meetingLink: z.string().url().max(1000).nullable().optional(),
    officeAddress: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    interviewType: z.enum(TYPES).optional(),
    scheduledAt: z.coerce.date().optional(),
    meetingLink: z.string().url().max(1000).nullable().optional(),
    officeAddress: z.string().max(500).nullable().optional(),
    outcome: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

function publicInterview(i) {
  return {
    id: i.id,
    applicationId: i.applicationId,
    jobTitle: i.jobTitle,
    company: i.company,
    interviewType: i.interviewType,
    scheduledAt: i.scheduledAt,
    meetingLink: i.meetingLink,
    officeAddress: i.officeAddress,
    outcome: i.outcome,
    notes: i.notes,
    reminderSent: i.reminderSent,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const interviews = await prisma.interview.findMany({
    where: { userId: req.session.userId },
    orderBy: { scheduledAt: 'asc' },
  });
  return res.json(interviews.map(publicInterview));
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const created = await prisma.interview.create({
    data: { userId: req.session.userId, ...parsed.data },
  });
  return res.status(201).json(publicInterview(created));
});

router.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const existing = await prisma.interview.findFirst({
    where: { id: req.params.id, userId: req.session.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Interview not found' });

  // A reschedule invalidates a reminder that already went out.
  const data = { ...parsed.data };
  if (data.scheduledAt && data.scheduledAt.getTime() !== existing.scheduledAt.getTime()) {
    data.reminderSent = false;
  }

  const updated = await prisma.interview.update({ where: { id: existing.id }, data });
  return res.json(publicInterview(updated));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const existing = await prisma.interview.findFirst({
    where: { id: req.params.id, userId: req.session.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Interview not found' });
  await prisma.interview.delete({ where: { id: existing.id } });
  return res.json({ ok: true });
});

module.exports = router;

// /api/applications — the 7-stage application tracker + CSV export.
// locationType is denormalized onto the Application (never joined to Job).
const express = require('express');
const { z } = require('zod');
const { Parser } = require('@json2csv/plainjs');
const prisma = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { isGhosted } = require('../services/applicationHealth');

const router = express.Router();

// Pipeline: Applied, Viewed, Phone Screen, Interview, Technical Test, Offer,
// Rejected/Withdrawn (split into two terminal states on the client).
const STATUSES = [
  'applied', 'viewed', 'phone_screen', 'interview', 'technical', 'offer', 'rejected', 'withdrawn',
];
const LOCATION_TYPES = ['Remote', 'Onsite', 'Hybrid'];

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  locationType: z.enum(LOCATION_TYPES).optional(),
});

const createSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    jobTitle: z.string().min(1).max(300).optional(),
    company: z.string().min(1).max(200).optional(),
    locationType: z.enum(LOCATION_TYPES).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

function publicApp(a) {
  return {
    id: a.id,
    jobId: a.jobId,
    jobTitle: a.jobTitle,
    company: a.company,
    locationType: a.locationType,
    status: a.status,
    notes: a.notes,
    applyUrl: a.applyUrl,
    source: a.source,
    resumeId: a.resumeId,
    isGhosted: isGhosted(a),
    appliedAt: a.appliedAt,
    updatedAt: a.updatedAt,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { status, locationType } = parsed.data;

  const apps = await prisma.application.findMany({
    where: { userId: req.session.userId, ...(status ? { status } : {}), ...(locationType ? { locationType } : {}) },
    orderBy: { appliedAt: 'desc' },
  });
  return res.json(apps.map(publicApp));
});

// CSV export — defined before /:id so the path is not captured as an id.
router.get('/export', requireAuth, async (req, res) => {
  const apps = await prisma.application.findMany({
    where: { userId: req.session.userId },
    orderBy: { appliedAt: 'desc' },
  });
  const parser = new Parser({
    fields: ['jobTitle', 'company', 'locationType', 'status', 'source', 'applyUrl', 'notes', 'appliedAt'],
  });
  const csv = parser.parse(apps.map(publicApp));
  res.header('Content-Type', 'text/csv');
  res.attachment('applications.csv');
  return res.send(csv);
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { jobId, notes } = parsed.data;
  let { jobTitle, company, locationType } = parsed.data;
  let applyUrl = null;

  // When applying from a job, copy its snapshot fields onto the application.
  if (jobId) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    jobTitle = job.title;
    company = job.company;
    locationType = job.locationType;
    applyUrl = job.applyUrl || null;
  }

  if (!jobTitle || !company || !locationType) {
    return res.status(400).json({ error: 'jobId, or jobTitle + company + locationType, is required' });
  }

  // Same "whichever resume is active right now" convention the auto-apply bot uses
  // (internal.js) — keeps resumeId meaningful across both creation paths.
  const resume = await prisma.resume.findFirst({
    where: { userId: req.session.userId, isActive: true },
    orderBy: { uploadedAt: 'desc' },
  });

  const app = await prisma.application.create({
    data: {
      userId: req.session.userId,
      jobId: jobId || null,
      jobTitle,
      company,
      locationType,
      status: 'applied',
      notes: notes || null,
      applyUrl,
      source: 'manual',
      resumeId: resume?.id || null,
    },
  });
  return res.status(201).json(publicApp(app));
});

router.patch('/:id', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  // Ownership check — never update another user's application.
  const existing = await prisma.application.findFirst({
    where: { id: req.params.id, userId: req.session.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Application not found' });

  const updated = await prisma.application.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  return res.json(publicApp(updated));
});

module.exports = router;

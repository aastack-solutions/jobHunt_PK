// /api/resumes/* — upload (+parse), list, current, manual skill edits.
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { z } = require('zod');
const prisma = require('../db');
const logger = require('../logger');
const requireAuth = require('../middleware/requireAuth');
const storage = require('../services/storageService');
const { rematchUser } = require('../services/matchingEngine');

const router = express.Router();

// memoryStorage ONLY — files live in a buffer until pushed to R2. Max 10 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PARSER_URL = process.env.RESUME_PARSER_URL || 'http://localhost:8000';

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : 'pdf';
}

// A resume is previewable only if its file actually landed in R2. Uploads made
// while R2 was unconfigured get a `local-unstored/...` placeholder key and have
// no retrievable file.
function isStored(fileKey) {
  return Boolean(fileKey) && !fileKey.startsWith('local-unstored/');
}

function publicResume(r) {
  return {
    id: r.id,
    fileName: r.fileName,
    skills: r.skills,
    experienceYears: r.experienceYears,
    seniorityLevel: r.seniorityLevel,
    isImageBased: r.isImageBased,
    parseWarning: r.parseWarning,
    uploadedAt: r.uploadedAt,
    stored: isStored(r.fileKey),
  };
}

// Send the buffer to the Python parser. Returns parsed fields, or a graceful
// fallback (empty skills + warning) if the parser is unreachable.
async function parseResume(buffer, fileName, contentType) {
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: contentType }), fileName);
    const { data } = await axios.post(`${PARSER_URL}/parse`, form, {
      headers: { 'X-Internal-Key': process.env.INTERNAL_SECRET || '' },
      timeout: 20000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return {
      skills: data.skills || [],
      experienceYears: data.experienceYears || 0,
      seniorityLevel: data.seniorityLevel || 'junior',
      isImageBased: Boolean(data.isImageBased),
      parseWarning: data.warning || null,
    };
  } catch (err) {
    logger.error(`Resume parser unreachable: ${err.message}`);
    return {
      skills: [],
      experienceYears: 0,
      seniorityLevel: 'junior',
      isImageBased: false,
      parseWarning: 'Resume parser is unavailable. Please enter your skills manually.',
    };
  }
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const userId = req.session.userId;
  const { buffer, originalname, mimetype } = req.file;
  const ext = extOf(originalname);

  // 1) Upload to R2 (graceful if R2 is not configured locally).
  let fileKey;
  let storageWarning = null;
  if (storage.isConfigured()) {
    try {
      fileKey = await storage.uploadBuffer(storage.buildResumeKey(userId, ext), buffer, mimetype);
    } catch (err) {
      // R2 misconfigured / access denied — don't fail the whole upload; still
      // parse and save the skills so the user isn't blocked locally.
      logger.error(`R2 upload failed: ${err.message}`);
      fileKey = `local-unstored/${userId}/${Date.now()}.${ext}`;
      storageWarning = 'File storage is unavailable; the file was not persisted, but skills were saved.';
    }
  } else {
    fileKey = `local-unstored/${userId}/${Date.now()}.${ext}`;
    storageWarning = 'File storage (R2) is not configured; the file was not persisted.';
    logger.warn('R2 not configured — skipping resume upload to storage.');
  }

  // 2) Parse via the Python service.
  const parsed = await parseResume(buffer, originalname, mimetype);
  const parseWarning = [parsed.parseWarning, storageWarning].filter(Boolean).join(' ') || null;

  // 3) Deactivate previous active resume(s), then save the new one.
  await prisma.resume.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
  const resume = await prisma.resume.create({
    data: {
      userId,
      fileName: originalname,
      fileKey,
      skills: parsed.skills,
      experienceYears: parsed.experienceYears,
      seniorityLevel: parsed.seniorityLevel,
      isImageBased: parsed.isImageBased,
      parseWarning,
      isActive: true,
    },
  });

  // New skills change scoring — re-match this user against all active jobs.
  await rematchUser(userId).catch((e) => logger.error(`rematch after upload: ${e.message}`));

  return res.status(201).json({
    skills: resume.skills,
    experienceYears: resume.experienceYears,
    seniorityLevel: resume.seniorityLevel,
    parseWarning: resume.parseWarning,
  });
});

router.get('/current', requireAuth, async (req, res) => {
  const resume = await prisma.resume.findFirst({
    where: { userId: req.session.userId, isActive: true },
    orderBy: { uploadedAt: 'desc' },
  });
  if (!resume) return res.status(404).json({ error: 'No resume uploaded yet' });
  return res.json(publicResume(resume));
});

router.get('/', requireAuth, async (req, res) => {
  const resumes = await prisma.resume.findMany({
    where: { userId: req.session.userId },
    orderBy: { uploadedAt: 'desc' },
  });
  return res.json(
    resumes.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      uploadedAt: r.uploadedAt,
      skillCount: r.skills.length,
      stored: isStored(r.fileKey),
    }))
  );
});

// Preview/download a stored resume — returns a short-lived signed R2 URL.
// 409 when the file was never persisted (R2 unconfigured at upload time).
router.get('/:id/download', requireAuth, async (req, res) => {
  const resume = await prisma.resume.findFirst({
    where: { id: req.params.id, userId: req.session.userId },
  });
  if (!resume) return res.status(404).json({ error: 'Resume not found' });
  if (!isStored(resume.fileKey) || !storage.isConfigured()) {
    return res.status(409).json({
      error: 'This file was not stored (file storage is not configured), so it cannot be previewed.',
    });
  }
  const url = await storage.getDownloadUrl(resume.fileKey);
  return res.json({ url });
});

const skillsSchema = z.object({ skills: z.array(z.string().min(1)).max(100) });

router.patch('/skills', requireAuth, async (req, res) => {
  const result = skillsSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }
  const active = await prisma.resume.findFirst({
    where: { userId: req.session.userId, isActive: true },
    orderBy: { uploadedAt: 'desc' },
  });
  if (!active) return res.status(404).json({ error: 'No active resume to update' });

  const updated = await prisma.resume.update({
    where: { id: active.id },
    data: { skills: result.data.skills },
  });

  // Manual skill edits change scoring — re-match this user.
  await rematchUser(req.session.userId).catch((e) => logger.error(`rematch after skills: ${e.message}`));

  return res.json(publicResume(updated));
});

module.exports = router;

// jobs/interviewReminders.js — runInterviewReminders(): email anyone with an
// interview in the next 24h that hasn't been reminded yet. Runs 08:00 UTC daily.
const prisma = require('../src/db');
const logger = require('../src/logger');
const { sendInterviewReminder } = require('../src/services/emailService');

async function runInterviewReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await prisma.interview.findMany({
    where: { reminderSent: false, scheduledAt: { gt: now, lte: in24h } },
    include: { user: true },
  });

  let sent = 0;
  for (const iv of due) {
    const ok = await sendInterviewReminder(iv.user, iv).catch((e) => {
      logger.error(`interview-reminder ${iv.id}: ${e.message}`);
      return false;
    });
    // Only mark sent when the email actually went out, so a fixed email config
    // later picks up the reminder instead of silently missing it.
    if (ok) {
      await prisma.interview.update({ where: { id: iv.id }, data: { reminderSent: true } });
      sent += 1;
    }
  }

  await prisma.schedulerLog.create({
    data: { jobName: 'interview-reminders', status: 'completed', jobCount: sent },
  });
  logger.info(`interview-reminders: ${sent}/${due.length} sent`);
  return { sent, due: due.length };
}

module.exports = { runInterviewReminders };

// services/emailService.js — Brevo SMTP via nodemailer. Degrades gracefully when
// Brevo isn't configured (logs + returns false) so scheduled jobs never crash.
// Every dynamic value in a template is escaped; map links get TWO separate
// escaping operations (encodeURIComponent for the href, escapeHtml for the text).
const nodemailer = require('nodemailer');
const logger = require('../logger');

function isConfigured() {
  return Boolean(process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY);
}

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_KEY },
    });
  }
  return transporter;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendMail({ to, subject, html }) {
  if (!isConfigured()) {
    logger.warn('email: BREVO not configured — skipping send');
    return false;
  }
  const from = process.env.EMAIL_FROM || process.env.BREVO_SMTP_USER;
  await getTransporter().sendMail({ from, to, subject, html });
  return true;
}

// 24h interview reminder. Onsite interviews include the office address as a
// one-click Google Maps link (travel time matters for in-person interviews).
async function sendInterviewReminder(user, interview) {
  const when = new Date(interview.scheduledAt).toUTCString();

  let locationBlock = '';
  if (interview.interviewType === 'onsite' && interview.officeAddress) {
    const mapHref = `https://maps.google.com/?q=${encodeURIComponent(interview.officeAddress)}`;
    const mapText = escapeHtml(interview.officeAddress);
    locationBlock = `<p>Location: <a href="${mapHref}">${mapText}</a></p>`;
  } else if (interview.meetingLink) {
    const href = encodeURI(interview.meetingLink);
    locationBlock = `<p>Meeting: <a href="${href}">${escapeHtml(interview.meetingLink)}</a></p>`;
  }

  const html = `
    <h2>Interview Reminder</h2>
    <p>Hi ${escapeHtml(user.fullName)}, you have an interview in about 24 hours.</p>
    <p><strong>${escapeHtml(interview.jobTitle)}</strong> at ${escapeHtml(interview.company)}</p>
    <p>When: ${escapeHtml(when)} &middot; ${escapeHtml(interview.interviewType)}</p>
    ${locationBlock}
    ${interview.notes ? `<p>Notes: ${escapeHtml(interview.notes)}</p>` : ''}
  `;

  return sendMail({
    to: user.email,
    subject: `Interview reminder: ${interview.jobTitle} at ${interview.company}`,
    html,
  });
}

module.exports = { sendMail, sendInterviewReminder, isConfigured, escapeHtml };

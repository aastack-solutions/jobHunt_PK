// Greenhouse-hosted application forms (boards.greenhouse.io/*). Field names/ids
// follow Greenhouse's classic `job_application[...]` convention; falls back to the
// generic taxonomy (fieldTaxonomy.js) for anything Greenhouse's newer embedded/React
// board variant renders differently — this hasn't been verified against a live
// posting yet (no network access in this dev environment); expect to adjust
// selectors after the first real Phase 1 shadow run.
const { bestMatch, scanFields } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

function matches(applyUrl) {
  try {
    return new URL(applyUrl).hostname.toLowerCase().includes('greenhouse.io');
  } catch {
    return false;
  }
}

// Most Greenhouse boards don't require a login to apply — credential is only used
// if the user configured one anyway (e.g. an internal/gated board). Guest apply is
// the common case, so a missing/failed login is not fatal here.
async function login(page, credential) {
  if (!credential) return { attempted: false };
  const loginLink = page.getByRole('link', { name: /log in|sign in/i }).first();
  if ((await loginLink.count()) === 0) return { attempted: false };
  await loginLink.click().catch(() => {});
  await page.getByLabel(/email/i).first().fill(credential.username).catch(() => {});
  await page.getByLabel(/password/i).first().fill(credential.password).catch(() => {});
  await page.getByRole('button', { name: /log in|sign in/i }).first().click().catch(() => {});
  return { attempted: true };
}

async function fillApplication(page, profile) {
  const fieldsFilled = {};

  const trySelectorThenFill = async (selectors, value, fieldKey) => {
    if (!value) return;
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.fill(String(value)).catch(() => {});
        fieldsFilled[fieldKey] = value;
        return;
      }
    }
  };

  await trySelectorThenFill(['#first_name', 'input[name="job_application[first_name]"]'],
    profile.fullName?.split(' ')[0], 'first_name');
  await trySelectorThenFill(['#last_name', 'input[name="job_application[last_name]"]'],
    profile.fullName?.split(' ').slice(1).join(' '), 'last_name');
  await trySelectorThenFill(['#email', 'input[name="job_application[email]"]'], profile.email, 'email');

  const resumeInput = page.locator('#resume, input[type="file"][name*="resume" i]').first();
  if (profile.resumeBuffer && (await resumeInput.count()) > 0) {
    await resumeInput
      .setInputFiles({ name: profile.resumeFileName || 'resume.pdf', mimeType: 'application/pdf', buffer: profile.resumeBuffer })
      .catch(() => {});
    fieldsFilled.resume_upload = profile.resumeFileName || 'resume.pdf';
  }

  // Fall back to the generic taxonomy for anything not covered above (custom
  // questions, phone, LinkedIn, etc. — mostly report as unmapped since the profile
  // doesn't carry those values yet, see internal.js's applicant payload comment).
  const fields = await scanFields(page);
  for (const key of ['phone', 'linkedin_url', 'portfolio_url']) {
    const match = bestMatch(fields, key);
    if (match) fieldsFilled[key] = { unmapped: true, label: match.field.label || match.field.name };
  }

  const requiredOk = Boolean(fieldsFilled.email && (fieldsFilled.first_name || profile.fullName) && fieldsFilled.resume_upload);
  return { fieldsFilled, confidence: requiredOk ? 90 : 40 };
}

function locateSubmit(page) {
  return page.locator('#submit_app, button:has-text("Submit Application")').first();
}

module.exports = { platform: 'greenhouse', matches, login, fillApplication, locateSubmit, detectCaptcha };

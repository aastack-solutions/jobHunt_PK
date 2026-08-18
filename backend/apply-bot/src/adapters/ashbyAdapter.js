// Ashby-hosted application forms (jobs.ashbyhq.com/*). Ashby's embedded form is more
// dynamically rendered than Greenhouse/Lever's, so this leans harder on the generic
// taxonomy fallback rather than hand-written selectors — same unverified-against-a-
// live-posting caveat as the other two adapters.
const { bestMatch, scanFields } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

function matches(applyUrl) {
  try {
    return new URL(applyUrl).hostname.toLowerCase().includes('ashbyhq.com');
  } catch {
    return false;
  }
}

async function login() {
  return { attempted: false }; // Ashby application forms are guest-apply
}

async function fillApplication(page, profile) {
  const fieldsFilled = {};
  const fields = await scanFields(page);

  const fillByIndex = async (key, value, isFile = false) => {
    if (!value) return;
    const match = bestMatch(fields, key);
    if (!match) return;
    // `fields` entries are returned by document order from fieldTaxonomy.scanFields,
    // so `nth(index)` on the same combined selector lines back up with the scan.
    const locator = page.locator('input, textarea, select').nth(match.field.index);
    if (isFile) {
      await locator
        .setInputFiles({ name: profile.resumeFileName || 'resume.pdf', mimeType: 'application/pdf', buffer: value })
        .catch(() => {});
    } else {
      await locator.fill(String(value)).catch(() => {});
    }
    fieldsFilled[key] = isFile ? profile.resumeFileName || 'resume.pdf' : value;
  };

  await fillByIndex('full_name', profile.fullName);
  await fillByIndex('email', profile.email);
  if (profile.resumeBuffer) await fillByIndex('resume_upload', profile.resumeBuffer, true);

  for (const key of ['phone', 'linkedin_url', 'portfolio_url']) {
    const match = bestMatch(fields, key);
    if (match && !fieldsFilled[key]) fieldsFilled[key] = { unmapped: true, label: match.field.label || match.field.name };
  }

  const requiredOk = Boolean(fieldsFilled.email && fieldsFilled.full_name && fieldsFilled.resume_upload);
  return { fieldsFilled, confidence: requiredOk ? 80 : 35 };
}

function locateSubmit(page) {
  return page.getByRole('button', { name: /submit application|apply/i }).first();
}

module.exports = { platform: 'ashby', matches, login, fillApplication, locateSubmit, detectCaptcha };

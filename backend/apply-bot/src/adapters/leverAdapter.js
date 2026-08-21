// Lever-hosted application forms (jobs.lever.co/*).
//
// Selector confidence note (2026-08-17): the `name`/`email`/`resume` selectors
// below are corroborated (not just guessed) against Lever's own official Postings
// API docs (github.com/lever/postings-api), which document `name`, `email`, and
// `resume` as the exact field keys their platform uses end to end — a real primary
// source, not a typical-convention guess. Still NOT verified against a live
// posting's actual rendered DOM: two direct fetch attempts against real, current
// jobs.lever.co postings both returned HTTP 403 (Lever blocks non-browser HTTP
// requests at the network layer), so this needs a real Playwright browser session
// to confirm — a raw fetch cannot substitute for one here. See
// docs/apply-bot/TEST_PLAN.md's F4 checklist for the remaining manual verification.
//
// Also confirmed via the same API docs: `comments` is a real, documented free-text
// field ("additional candidate information") — a plausible cover-letter target this
// adapter doesn't currently fill (no adapter does; the project's existing AI
// cover-letter feature isn't wired into the apply-bot flow at all yet). Worth
// scoping as a future enhancement, not done here — out of F4's stated scope
// ("verify/fix selectors"), and integrating AI generation into the unattended apply
// flow deserves its own review given the project's zero-review-except-CAPTCHA design.
const { bestMatch, scanFields } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

// Exact-or-subdomain match, not substring — found & fixed 2026-08-21 (security
// review). The original `.includes('lever.co')` also matches a hostname like
// "jobs.lever.co.attacker.com" (the real domain appears as a substring, not as
// the actual host), which is a real, untrusted-input-reachable spoof since
// applyUrl comes from ~13 external job-fetch sources. See the identical fix in
// backend/src/services/applyBotPlatform.js for the full writeup.
function matches(applyUrl) {
  try {
    const hostname = new URL(applyUrl).hostname.toLowerCase();
    return hostname === 'lever.co' || hostname.endsWith('.lever.co');
  } catch {
    return false;
  }
}

// Lever postings are guest-apply by default — no applicant-facing login exists on
// most boards. A configured credential is a no-op here unless the board is gated.
async function login() {
  return { attempted: false };
}

async function fillApplication(page, profile) {
  const fieldsFilled = {};

  const fill = async (selector, value, key) => {
    if (!value) return;
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.fill(String(value)).catch(() => {});
      fieldsFilled[key] = value;
    }
  };

  await fill('input[name="name"]', profile.fullName, 'full_name');
  await fill('input[name="email"]', profile.email, 'email');

  const resumeInput = page.locator('input[name="resume"]').first();
  if (profile.resumeBuffer && (await resumeInput.count()) > 0) {
    await resumeInput
      .setInputFiles({ name: profile.resumeFileName || 'resume.pdf', mimeType: 'application/pdf', buffer: profile.resumeBuffer })
      .catch(() => {});
    fieldsFilled.resume_upload = profile.resumeFileName || 'resume.pdf';
  }

  const fields = await scanFields(page);
  for (const key of ['phone', 'linkedin_url', 'portfolio_url']) {
    const match = bestMatch(fields, key);
    if (match) fieldsFilled[key] = { unmapped: true, label: match.field.label || match.field.name };
  }

  const requiredOk = Boolean(fieldsFilled.email && fieldsFilled.full_name && fieldsFilled.resume_upload);
  return { fieldsFilled, confidence: requiredOk ? 90 : 40 };
}

function locateSubmit(page) {
  return page.locator('button[type="submit"]:has-text("Submit")').first();
}

module.exports = { platform: 'lever', matches, login, fillApplication, locateSubmit, detectCaptcha };

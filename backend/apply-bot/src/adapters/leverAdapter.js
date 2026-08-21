// Lever-hosted application forms (jobs.lever.co/*).
//
// Selector confidence note (2026-08-17): the `name`/`email`/`resume` selectors
// below are corroborated (not just guessed) against Lever's own official Postings
// API docs (github.com/lever/postings-api), which document `name`, `email`, and
// `resume` as the exact field keys their platform uses end to end — a real primary
// source, not a typical-convention guess.
//
// **Verified 2026-08-19 (F4) against 5 real, currently-open postings** (Palantir,
// Apollo Research, Veeva, H1, Velo3D — see docs/apply-bot/TEST_PLAN.md F4 and
// MEMORY.md for the full session): `name`/`email`/`resume` selectors match exactly
// as documented — confirmed by both `fillApplication()`'s own return value and an
// independent DOM read of the actual field values/file count after fill, plus
// before/after screenshots. All 5 were guest-apply (no login), confirming `login()`
// as a correct no-op — no gated board found. All 5 also rendered a real hCaptcha
// widget (`.h-captcha` + iframe + hidden `h-captcha-response` input) — this
// resolves the previously-open "does Lever present a CAPTCHA?" question: yes,
// apparently as standard, not an edge case, same posture as Greenhouse (see F5).
// Two real bugs found and fixed during this verification: `locateSubmit()` below
// (targeted a selector that matches neither of Lever's two submit-shaped buttons),
// and `captchaDetector.js`'s `isAlreadySolved()` (checked for a `<textarea>`
// response element; Lever's real hCaptcha integration uses `<input type="hidden">`).
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

// Verified 2026-08-19 against 5 real, currently-open postings (see
// docs/apply-bot/TEST_PLAN.md F4): Lever's real DOM has TWO submit-shaped buttons —
// a `button[type="submit"]` with NO text (the form's real submit, triggered
// programmatically after hCaptcha validates) and a *visible*
// `button[type="button"]` reading "Submit application" that's the one an actual
// applicant clicks. The old selector (`button[type="submit"]:has-text("Submit")`)
// matches neither and would have silently found nothing in live mode.
function locateSubmit(page) {
  return page.locator('button:has-text("Submit application")').first();
}

module.exports = { platform: 'lever', matches, login, fillApplication, locateSubmit, detectCaptcha };

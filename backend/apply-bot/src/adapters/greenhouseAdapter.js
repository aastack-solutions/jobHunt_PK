// Greenhouse-hosted application forms (boards.greenhouse.io/* and
// job-boards.greenhouse.io/* — Greenhouse has fully migrated to the latter
// domain; boards.greenhouse.io now just redirects, confirmed 2026-08-19 when
// several search-result URLs on the old domain all 404'd/redirected).
//
// **Verified 2026-08-19 (F5) against 5 real, currently-open postings on the new
// job-boards.greenhouse.io React-rendered board** (Sourcegraph x3, tastytrade,
// ZipRecruiter — see docs/apply-bot/TEST_PLAN.md F5 and MEMORY.md): the newer
// board dropped `name` attributes entirely (every input's `name` is empty) but
// kept the SAME `id` values (`#first_name`, `#last_name`, `#email`, `#resume`) —
// so the existing `#id`-first selector strategy below works unchanged; the
// `job_application[...]` `name`-attribute fallback is now dead code for this
// board variant specifically (kept as a fallback for any board still on the
// classic format, not removed). Resume upload confirmed working on all 5 —
// Greenhouse's React form unmounts/replaces the `#resume` input once a file is
// accepted (a UI implementation detail, not a bug), so verifying success means
// checking the filename appears in the rendered page, not re-querying the input.
// **Hydration-timing question resolved**: no explicit `waitForSelector` needed —
// tested with worker.js's exact real navigation option (`domcontentloaded` only,
// zero extra wait) and fields still filled correctly; Playwright's own
// locator-based `.fill()`/`.setInputFiles()` already auto-wait for the element.
// **CAPTCHA confirmed present on all 5** (reCAPTCHA, `iframe[src*="recaptcha"]`) —
// on 4/5 visible immediately on page load; on 1 (ZipRecruiter) it was NOT
// present pre-fill but appeared post-fill (behavioral-trigger detection, exactly
// the "sometimes invisible" case flagged in the plan) — confirms worker.js's
// existing pre-fill AND post-fill `detectCaptcha()` calls are both load-bearing,
// not redundant.
const { bestMatch, scanFields } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

// Exact-or-subdomain match, not substring — found & fixed 2026-08-21 (security
// review). The original `.includes('greenhouse.io')` also matches a hostname
// like "boards.greenhouse.io.attacker.com" (the real domain appears as a
// substring, not as the actual host). Since applyUrl comes from ~13 untrusted
// external job-fetch sources and this adapter is the one that actually types a
// real decrypted credential into the page (see login() below), this was a
// complete, unattended credential-exfiltration path: a malicious listing routed
// here, the bot decrypted the user's real Greenhouse password, and typed it into
// whatever the attacker's fake login form offered.
function matches(applyUrl) {
  try {
    const hostname = new URL(applyUrl).hostname.toLowerCase();
    return hostname === 'greenhouse.io' || hostname.endsWith('.greenhouse.io');
  } catch {
    return false;
  }
}

// Most Greenhouse boards don't require a login to apply — credential is only used
// if the user configured one anyway (e.g. an internal/gated board). Guest apply is
// the common case, so a missing/failed login is not fatal here.
//
// Defense-in-depth, added alongside the matches() fix above: re-verify the page
// is actually still on a real greenhouse.io host immediately before typing the
// credential, not just at task-creation time. matches() is the primary guard,
// but a credential-typing function that trusts its caller completely is one bug
// away (a future matches() regression, a mid-session redirect) from repeating
// the exact same exfiltration path — this makes the check redundant on purpose.
async function login(page, credential) {
  if (!credential) return { attempted: false };
  let hostname;
  try {
    hostname = new URL(page.url()).hostname.toLowerCase();
  } catch {
    return { attempted: false };
  }
  if (hostname !== 'greenhouse.io' && !hostname.endsWith('.greenhouse.io')) {
    return { attempted: false };
  }
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

// Ashby-hosted application forms (jobs.ashbyhq.com/*). Ashby's embedded form is more
// dynamically rendered than Greenhouse/Lever's, so this leans harder on the generic
// taxonomy fallback rather than hand-written selectors.
//
// **Verified 2026-08-19 (F6) against 5 real, currently-open postings** (Valon, Ashby
// itself, Ramp ×2, Linear — see docs/apply-bot/TEST_PLAN.md F6 and MEMORY.md): the
// generic-taxonomy approach correctly finds and fills Ashby's system fields
// (`_systemfield_name`, `_systemfield_email`, `_systemfield_resume`) via label
// matching on all 5, plus correctly recording phone/LinkedIn/portfolio/GitHub as
// `unmapped` wherever present, never guessed. **Two real bugs found and fixed**,
// both in `ensureApplicationFormVisible()` below: (1) a real hydration-timing race
// — `scanFields()`'s raw `page.evaluate()` has no auto-wait, unlike Greenhouse/
// Lever's Locator-based fill calls, so calling `fillApplication()` right after
// `domcontentloaded` (worker.js's actual navigation option) found zero fields on
// Ashby's inline-form postings even though the same test passed instantly on
// Greenhouse; (2) 2 of the 5 postings render the form on a separate `/application`
// sub-path reached only by clicking an "Apply for this Job" control — the old code
// assumed the form was always already on the page. Both fixed by the same explicit
// wait. **CAPTCHA**: not observed on any of the 5 postings tested — unlike Lever
// and Greenhouse (both 100% in their own F4/F5 sessions), Ashby did not present one
// in this sample. Not proof no Ashby board ever uses one, just the first real data
// point.
const { bestMatch, scanFields } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

// Exact-or-subdomain match, not substring — found & fixed 2026-08-21 (security
// review). The original `.includes('ashbyhq.com')` also matches a hostname like
// "jobs.ashbyhq.com.attacker.com" (the real domain appears as a substring, not
// as the actual host). See the identical fix in
// backend/src/services/applyBotPlatform.js for the full writeup.
function matches(applyUrl) {
  try {
    const hostname = new URL(applyUrl).hostname.toLowerCase();
    return hostname === 'ashbyhq.com' || hostname.endsWith('.ashbyhq.com');
  } catch {
    return false;
  }
}

async function login() {
  return { attempted: false }; // Ashby application forms are guest-apply
}

const NAME_FIELD_SELECTOR = '#_systemfield_name, [name="_systemfield_name"]';

// Verified 2026-08-19 (F6, see docs/apply-bot/TEST_PLAN.md and MEMORY.md): two
// separate real-DOM issues, both fixed here together since the same wait covers both.
//
// 1. **Hydration timing (the more important fix)**: `scanFields()` runs a single,
//    synchronous `page.evaluate()` — unlike Greenhouse/Lever's Locator-based
//    `.fill()`/`.setInputFiles()` calls, which auto-wait for their target element,
//    a raw `evaluate()` has NO built-in wait and just reads whatever's in the DOM
//    at that exact instant. Confirmed this is a real, not theoretical, problem:
//    calling `fillApplication()` immediately after `domcontentloaded` (worker.js's
//    real navigation option, zero extra wait) found ZERO fields on Ashby's inline-
//    form postings — Greenhouse's equivalent test passed instantly. Fixed by
//    explicitly waiting for the name field to exist before scanning.
// 2. **Click-through boards**: some Ashby-hosted postings render the form inline;
//    others require clicking a separate "Apply for this Job" link/button first,
//    which navigates to a `/application` sub-path (2 of 5 real postings tested
//    needed this; the other 3 didn't). Without handling this, `fillApplication()`
//    would scan an empty page on those and abstain with `skipped_low_confidence`,
//    never reaching a real, fillable form one click away.
async function ensureApplicationFormVisible(page) {
  const foundInline = await page.waitForSelector(NAME_FIELD_SELECTOR, { timeout: 5000 }).catch(() => null);
  if (foundInline) return;

  const applyLink = page.locator('a:has-text("Apply for this Job"), button:has-text("Apply for this Job")').first();
  if ((await applyLink.count()) === 0) return; // no click-through control found — nothing more to try
  await applyLink.click().catch(() => {});
  await page.waitForSelector(NAME_FIELD_SELECTOR, { timeout: 10000 }).catch(() => {});
}

async function fillApplication(page, profile) {
  await ensureApplicationFormVisible(page);
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

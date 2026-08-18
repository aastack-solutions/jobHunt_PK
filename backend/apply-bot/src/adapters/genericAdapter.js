// Generic adapter (F8) — best-effort autofill for the ~9 non-ATS sources
// (Remotive, Adzuna, Jooble, etc.) whose applyUrl isn't a known ATS.
//
// STATUS: scaffolded 2026-08-17, not implemented. Gated off end-to-end —
// backend/jobs/applyBotSelect.js never creates a task for platform "generic"
// unless APPLY_BOT_GENERIC_ENABLED=true, so this adapter is registered in
// adapters/index.js but never actually invoked yet. Safe to leave wired in.
//
// Read before implementing:
//   - docs/apply-bot/TECHNICAL_PLAN.md F8 (full spec, risks, why this is
//     lowest-confidence/highest-variance feature in the plan)
//   - docs/apply-bot/01-research-plan.md §E (build a real fixture corpus from
//     actual non-ATS applyUrls BEFORE tuning SYNONYMS — don't guess)
//   - docs/apply-bot/04-confidence-and-filter-tuning.md (the abstain rule is the
//     entire safety mechanism here — do not lower MIN_CONFIDENCE_TO_FILL to make
//     this feature's numbers look better)
//
// Unlike the three ATS adapters (which use fieldTaxonomy.js only as a fallback
// for secondary fields), this adapter IS fieldTaxonomy.js applied to every
// required field — there's no hand-written selector set to fall back to, since
// by definition the destination's DOM structure is unknown ahead of time.
const { bestMatch, scanFields, MIN_CONFIDENCE_TO_FILL } = require('../engine/fieldTaxonomy');
const { detectCaptcha } = require('../engine/captchaDetector');

// Last-resort fallback — matches any well-formed http(s) URL that no ATS-specific
// adapter claimed. Deliberately still rejects genuinely malformed input (rather
// than blindly returning true for anything) — a catch-all for "unknown but real
// URL" is not the same as "anything at all." Must stay LAST in adapters/index.js's
// ADAPTERS array (resolveAdapter() uses Array.find(), first match wins) or it will
// shadow every other adapter.
function matches(applyUrl) {
  try {
    const url = new URL(applyUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

// Most non-ATS destinations don't have an applicant login at all (see F8's
// "Technical approach" — many applyUrls turn out to be redirect/listing pages,
// not forms, once actually visited). Start as a no-op; revisit only if real data
// from a fixture corpus shows otherwise.
async function login(/* page, credential */) {
  return { attempted: false };
}

async function fillApplication(page, profile) {
  const fieldsFilled = {};
  const fields = await scanFields(page);

  // TODO(F8): this loop is the actual feature. Wire each taxonomy key to a real
  // fill action once docs/apply-bot/01 §E's fixture corpus exists to validate
  // against — right now this only detects and records fields, it never fills
  // any of them, which is a deliberately safe (does-nothing) starting point,
  // not a finished abstain-by-default implementation.
  const REQUIRED_KEYS = ['email', 'full_name', 'resume_upload'];
  const OPTIONAL_KEYS = ['first_name', 'last_name', 'phone', 'linkedin_url', 'portfolio_url', 'cover_letter_text'];

  for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
    const match = bestMatch(fields, key);
    if (!match) continue;
    // TODO(F8): actually fill `match.field` here (locator by index, same pattern
    // ashbyAdapter.js already uses: page.locator('input, textarea, select').nth(match.field.index))
    // for now, only record what WOULD be targeted, never write to the page.
    fieldsFilled[key] = { detected: true, confidence: match.confidence, label: match.field.label || match.field.name };
  }

  // Abstain rule (per docs/apply-bot/04): never report a fillable confidence
  // without actually having filled the required fields. Since this scaffold
  // never fills anything yet, it must always abstain — this is correct,
  // intentional behavior until the TODO above is implemented, not a bug.
  return { fieldsFilled, confidence: 0 };
}

function locateSubmit(page) {
  // TODO(F8): no generic submit-button heuristic exists yet. A reasonable start:
  // page.getByRole('button', { name: /submit|apply/i }).first() — but verify
  // against the real fixture corpus first, this is untested even as a guess.
  return page.getByRole('button', { name: /submit|apply/i }).first();
}

module.exports = { platform: 'generic', usesBrowser: true, matches, login, fillApplication, locateSubmit, detectCaptcha };

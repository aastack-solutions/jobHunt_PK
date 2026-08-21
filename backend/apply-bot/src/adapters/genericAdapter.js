// Generic adapter (F8) — best-effort autofill for the ~9 non-ATS sources
// (Remotive, Adzuna, Jooble, etc.) whose applyUrl isn't a known ATS.
//
// STATUS: implemented 2026-08-19 (F8). Still gated off end-to-end —
// backend/jobs/applyBotSelect.js never creates a task for platform "generic"
// unless APPLY_BOT_GENERIC_ENABLED=true, and that flag stays false: the section E
// corpus research found only 1 of 20 real non-ATS applyUrls is a fillable form at
// all, so turning this on today would mostly produce abstains against listing
// pages. It is implemented so that it is correct and safe WHEN enabled, not
// because enabling it is currently worthwhile.
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

  // Uses a stable id/name attribute selector rather than fieldTaxonomy.scanFields's
  // positional index -- found and fixed 2026-08-20 (code review), same bug and same
  // fix as ashbyAdapter.js's locatorForField(): filling one field can mutate the DOM
  // before a later field is filled (a re-render inserting/removing a sibling
  // element), which silently shifts what nth(index) resolves to in the LIVE DOM
  // versus what it pointed at when `fields` was scanned. On a form of genuinely
  // unknown structure -- this adapter's entire premise -- that risk is at least as
  // real as it was for Ashby, arguably more so since there's no hand-verified
  // selector set to fall back to at all.
  // field.id/field.name are read straight off untrusted, third-party page DOM
  // attributes -- found and fixed 2026-08-21 (security review), same bug and same
  // fix as ashbyAdapter.js's locatorForField(): interpolating them unescaped into
  // this quoted attribute selector lets a crafted id/name value (containing a `"`
  // that breaks out of the quoted value) redirect this locator to resolve against
  // a different element than the one bestMatch() actually scored -- breaking the
  // confidence-scoring's field-to-target guarantee this code otherwise relies on.
  // Escaping backslash/quote is what a quoted CSS attribute-value string actually
  // needs to stay a literal string -- NOT the DOM's CSS.escape() (CSS is not a
  // Node.js global; this function runs in Node via page.locator(), not inside a
  // page.evaluate() browser callback).
  const escapeAttrValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const locatorForField = (field) => {
    if (field.id) return page.locator(`[id="${escapeAttrValue(field.id)}"]`).first();
    if (field.name) return page.locator(`[name="${escapeAttrValue(field.name)}"]`).first();
    return page.locator('input, textarea, select').nth(field.index);
  };

  // Records a field as filled ONLY if the fill/upload actually succeeded -- found
  // and fixed 2026-08-20 (code review): the original swallowed fill()/setInputFiles()
  // errors via .catch(() => {}) and then recorded fieldsFilled[key] = value
  // unconditionally regardless, so a genuinely-failed fill (a disabled/readonly
  // field, a stale/inactionable element) was reported identically to a real success.
  // That directly undermines the abstain rule -- this adapter's own comment calls it
  // "the entire safety mechanism" -- since requiredOk below trusts fieldsFilled's
  // presence, not actual DOM state. Confirmed with a real disabled-input fixture:
  // .fill() threw as expected, but the old code still recorded the field as filled
  // with the actual input value left blank.
  const fillByIndex = async (key, value, isFile = false) => {
    if (!value) return false;
    const match = bestMatch(fields, key);
    if (!match) return false;
    const locator = locatorForField(match.field);
    try {
      if (isFile) {
        await locator.setInputFiles({ name: profile.resumeFileName || 'resume.pdf', mimeType: 'application/pdf', buffer: value });
      } else {
        await locator.fill(String(value));
      }
    } catch {
      return false; // the fill genuinely failed -- do not report it as filled
    }
    fieldsFilled[key] = isFile ? profile.resumeFileName || 'resume.pdf' : value;
    return true;
  };

  // Name: a form asks for it either as one field or as two, never reliably both.
  // Try the single field first, and only fall back to the split pair -- filling both
  // shapes would put the full name into a "First name" box on forms that have both.
  const filledFullName = await fillByIndex('full_name', profile.fullName);
  if (!filledFullName && profile.fullName) {
    const [first, ...rest] = profile.fullName.split(' ');
    const filledFirst = await fillByIndex('first_name', first);
    await fillByIndex('last_name', rest.join(' '));
    // A split name counts as having supplied the name, but only if the FIRST name
    // landed -- a lone surname is not an identification.
    if (filledFirst) fieldsFilled.full_name = profile.fullName;
  }

  await fillByIndex('email', profile.email);
  if (profile.resumeBuffer) await fillByIndex('resume_upload', profile.resumeBuffer, true);

  // Recorded, never guessed. The schema has nowhere to read a phone number,
  // LinkedIn or portfolio from (see routes/internal.js's note on this), so the
  // honest report is "this form asked for it and we could not supply it" -- which is
  // also the audit data docs/apply-bot/04 wants for tuning.
  for (const key of ['phone', 'linkedin_url', 'portfolio_url', 'cover_letter_text', 'work_authorization', 'salary_expectation']) {
    const match = bestMatch(fields, key);
    if (match && !fieldsFilled[key]) fieldsFilled[key] = { unmapped: true, label: match.field.label || match.field.name };
  }

  // The abstain rule, and the entire safety mechanism for this adapter: a real
  // identification (name + email) AND a resume actually attached. Anything short of
  // that reports below worker.js's LOW_CONFIDENCE_THRESHOLD (60), which makes the
  // task skipped_low_confidence rather than submitted. Never lower this to make the
  // abstain rate look better -- docs/apply-bot/04 says so explicitly, and on a form
  // of unknown structure this check is all that stands between the bot and sending
  // a blank application.
  const requiredOk = Boolean(fieldsFilled.email && fieldsFilled.full_name && fieldsFilled.resume_upload);

  // 70, not the 80 the hand-written ATS adapters report: those match on selectors
  // verified against real postings, this one inferred every field from labels it has
  // never seen before. Clears the threshold when everything required is genuinely
  // present, while still recording that it is the less certain path.
  return { fieldsFilled, confidence: requiredOk ? 70 : 30 };
}

// Anchored on purpose. An unanchored /submit|apply/ matches "Apply to other jobs",
// "Submit a referral" and similar links that sit on the same page -- on a form whose
// structure is unknown, clicking the wrong one is worse than not finding a button
// (worker.js treats a missing submit as a failure, which is recoverable; a wrong
// click is not). Ordered most- to least-specific, first hit wins.
const SUBMIT_PATTERNS = [
  /^submit application$/i,
  /^submit$/i,
  /^send application$/i,
  /^apply( now| for this job)?$/i,
];

// Async -- found and fixed 2026-08-20 (code review). The original was synchronous
// and checked `if (candidate)`, but a Playwright Locator object is ALWAYS truthy
// regardless of how many elements it actually matches -- `.first()` returns a lazy
// handle, not a resolved element. That made the loop return pattern #1's locator on
// its very first iteration every time, even when NOTHING on the page matched
// "submit application" exactly -- confirmed directly with a fixture button reading
// "Apply Now" (matches pattern #4): candidate.count() was 0, yet `if (candidate)`
// was still true. Patterns #2-#4 were unreachable dead code. In live mode this
// meant `submitButton.click()` was called on a locator matching zero elements on
// every form except one with a button reading EXACTLY "submit application" -- a
// 10-second timeout and a failed task on every other real "Apply Now"/"Submit"/
// "Send Application" button. Fixed by actually awaiting `.count()` to check whether
// a pattern matches before committing to it. worker.js's call site is updated to
// `await` this (harmless for the other three adapters' synchronous locateSubmit --
// awaiting a plain Locator, which is not thenable, just returns it unchanged).
async function locateSubmit(page) {
  for (const pattern of SUBMIT_PATTERNS) {
    const candidate = page.getByRole('button', { name: pattern }).first();
    if ((await candidate.count()) > 0) return candidate;
  }
  return page.getByRole('button', { name: SUBMIT_PATTERNS[0] }).first();
}

module.exports = { platform: 'generic', usesBrowser: true, matches, login, fillApplication, locateSubmit, detectCaptcha };

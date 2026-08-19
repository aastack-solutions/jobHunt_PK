// CAPTCHA detection — 3-strategy cascade adopted from the ProBot/Nasiqa reference
// architecture (see autoappy.md and the plan's §4), scaled down: Phase 1 has no
// live-view/pause UI yet, so a detected CAPTCHA just fails the task with
// failureClass: 'CAPTCHA' rather than pausing. The detection logic itself is
// reused as-is since Phase 2 needs exactly this to decide when to pause.
const WIDGET_SELECTORS = [
  '.g-recaptcha', '#g-recaptcha', '.recaptcha-checkbox', 'iframe[src*="recaptcha"]',
  '.h-captcha', '#h-captcha', 'iframe[src*="hcaptcha"]',
  'iframe[src*="turnstile"]', '.cf-turnstile',
];

// Deliberately narrow — broader matching risks catching a submit button with
// "captcha" somewhere in an unrelated id/class.
const IMAGE_SELECTORS = ['img[alt*="captcha" i]', 'img[src*="captcha"]'];

const TEXT_PATTERNS = ['verify you are human', 'prove you are not a robot', 'security check'];

async function isAlreadySolved(page) {
  // If a solved-response field already has a value, the widget rendered but the
  // challenge is done — don't treat it as a fresh detection (this is the ProBot
  // detail most worth copying: without it, an already-solved captcha the page
  // hasn't navigated past yet looks identical to an unsolved one).
  //
  // The response element's tag varies by integration: reCAPTCHA typically renders
  // it as a <textarea>, but Lever's real hCaptcha integration (confirmed 2026-08-19
  // against 5 real postings — see docs/apply-bot/TEST_PLAN.md F4) uses a plain
  // <input type="hidden">. The original textarea-only selector never matched
  // Lever's DOM at all, so this check silently always returned "not solved" there —
  // safe-direction (never under-reports a real captcha) but wrong, so fixed to
  // check both tags via the attribute selector alone (matches either).
  const solved = await page
    .evaluate(() => {
      const g = document.querySelector('[name="g-recaptcha-response"]');
      const h = document.querySelector('[name="h-captcha-response"]');
      const gOk = !g || g.value.trim().length > 0;
      const hOk = !h || h.value.trim().length > 0;
      return (g || h) ? (gOk && hOk) : null; // null = neither widget present
    })
    .catch(() => null);
  return solved === true;
}

async function detectCaptcha(page) {
  for (const selector of WIDGET_SELECTORS) {
    const el = await page.$(selector).catch(() => null);
    if (el) {
      if (await isAlreadySolved(page)) return { detected: false };
      return { detected: true, strategy: 'widget', selector };
    }
  }

  for (const selector of IMAGE_SELECTORS) {
    const el = await page.$(selector).catch(() => null);
    if (el) return { detected: true, strategy: 'image', selector };
  }

  const bodyText = await page
    .evaluate(() => document.body?.innerText?.toLowerCase() || '')
    .catch(() => '');
  const matchedPattern = TEXT_PATTERNS.find((p) => bodyText.includes(p));
  if (matchedPattern) return { detected: true, strategy: 'text', pattern: matchedPattern };

  return { detected: false };
}

// Generic, adapter-agnostic signal that we're looking at a login page rather than
// the actual application form — most commonly caused by a reused sessionState
// (ApplyCredential.sessionStateEncrypted) having expired, sending the page to a
// login screen the adapter was never told to expect. Deliberately NOT
// ATS-specific: a real login form has a password field and no resume/file upload —
// an application form never has a password field and (for the ATS adapters, per
// their own required-field rules) always needs a resume upload. Call this AFTER
// adapter.login() (a login attempt may legitimately need to pass through a login
// form first) and BEFORE fillApplication() — if this is still true at that point,
// something is wrong and the adapter should not proceed to blindly fill whatever
// fields it finds on what is actually a login page.
async function looksLikeLoginPage(page) {
  const [passwordCount, fileUploadCount] = await Promise.all([
    page.locator('input[type="password"]').count().catch(() => 0),
    page.locator('input[type="file"]').count().catch(() => 0),
  ]);
  return passwordCount > 0 && fileUploadCount === 0;
}

// TODO(F7): text-scan for the second real bot-challenge type real-world research
// found (see MEMORY.md's Zapply research entry) — a 6-digit email-verification
// code prompt, distinct from a CAPTCHA. Scaffolded as its own function (not folded
// into detectCaptcha) since worker.js needs to know WHICH kind of challenge it hit
// to set the right ApplyTask.pauseReason ('captcha' vs 'email_verification') per
// Contract B — same narrow-pattern-matching approach as TEXT_PATTERNS above, not
// implemented yet because the exact phrasing patterns need to come from a real
// example, not a guess.
const EMAIL_VERIFICATION_PATTERNS = [
  'check your email', 'verification code', 'enter the code we sent', 'we sent you a code',
];

async function detectEmailVerification(page) {
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.toLowerCase() || '')
    .catch(() => '');
  const matchedPattern = EMAIL_VERIFICATION_PATTERNS.find((p) => bodyText.includes(p));
  if (matchedPattern) return { detected: true, strategy: 'text', pattern: matchedPattern };
  return { detected: false };
}

module.exports = { detectCaptcha, isAlreadySolved, looksLikeLoginPage, detectEmailVerification };

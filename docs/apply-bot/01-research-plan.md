# 01 — Research Plan

Seven areas need real investigation before Phase 1 can be trusted or Phase 2 started.
Each has a concrete method, not just "look into it."

## A. Verify the Greenhouse/Lever/Ashby selectors against real postings

**Why it matters**: `backend/apply-bot/src/adapters/greenhouseAdapter.js`,
`leverAdapter.js`, and `ashbyAdapter.js` were written from memory of typical ATS
conventions (`#first_name`, `input[name="job_application[first_name]"]`, etc.),
**never checked against a live page**. ATS vendors change their DOM without notice,
and "typical" isn't the same as "correct today."

**Method**:
1. Find 3-5 real, currently-open postings per platform (search
   `site:boards.greenhouse.io`, `site:jobs.lever.co`, `site:jobs.ashbyhq.com`).
2. Open each in a browser, inspect the actual form: field `name`/`id` attributes,
   whether the resume upload is a native `<input type="file">` or a custom
   drag-and-drop widget wrapping a hidden input, whether the form is server-rendered
   or a client-side React app that renders fields after a delay.
3. Compare against the selectors hardcoded in each adapter. Update the selector
   lists (`trySelectorThenFill` calls in `greenhouseAdapter.js`, the `fill()` calls in
   `leverAdapter.js`) to match what you actually find.
4. Specifically check: does the form require `page.waitForSelector` before fields
   exist (React-hydration delay)? Right now `worker.js` only waits for
   `domcontentloaded` before calling the adapter — if any of these forms render
   fields asynchronously after that point, the adapter will find nothing and abstain
   (`skipped_low_confidence`) even on a normal, fillable form. This is the single
   highest-risk unverified assumption in the whole adapter layer.

## B. Evaluate CAPTCHA-solving vendors before building the live-view by hand

**Why it matters**: the plan already flagged this as a checkpoint. Building the
screenshot-polling + WS input-relay system (§4 of the plan) is real engineering time;
a managed provider might remove most of it.

**Method**: spend a day, not a sprint, on this before writing any live-view code.
- Sign up for Browserbase and Browserless free/trial tiers.
- Run one real login+CAPTCHA flow through each (a Greenhouse account login is a
  reasonable test case).
- Note: does the provider's built-in live-view actually let a human solve the
  CAPTCHA and hand control back to your script? What's the actual cost at your
  expected volume (top ~20-30 tasks/day × 2-5 users = worst case ~150 tasks/day, but
  realistically far fewer once the daily cap and dedupe filters run)?
- Decision output: a one-page comparison (cost at realistic volume, integration
  effort in days, what you keep building vs. what you get for free) before touching
  `browserSession.js`'s screencast code.

## C. ToS / legal review, per platform, before flipping anything to live mode

**Why it matters**: this was flagged at plan time as a standing risk you accepted for
your own accounts — worth turning into an actual checklist rather than a one-time
verbal acknowledgment, since ToS pages change.

**Method**: for each platform the bot will touch (Greenhouse, Lever, Ashby, and
whatever the Phase 2 generic engine ends up reaching), read the current Terms of
Service / Acceptable Use policy for language about automation, bots, or scripted
access. Keep a dated note per platform (a table in this file's future revision is
fine) so "we checked" has a timestamp, not just a memory.

## D. Decide what to do about missing applicant fields (phone, LinkedIn, portfolio)

**Why it matters**: `backend/src/routes/internal.js`'s task-claim endpoint currently
returns `applicant: { fullName, email, resumeDownloadUrl, skills }` — no phone,
LinkedIn URL, or portfolio URL, because none of those exist on the `User` model.
Adapters currently detect these fields via the generic taxonomy but can only mark
them `{ unmapped: true }` in the audit trail — they're never actually filled. On any
ATS where phone is a *required* field, this alone will tank the confidence score
below the abstain threshold and skip the task, even though everything else about the
match was fine.

**Method**: this is a product decision, not a research task per se, but it needs an
answer before Phase 1 numbers mean anything:
- Option 1: add `phone`, `linkedinUrl`, `portfolioUrl` to `User` (a schema change —
  needs the same explicit sign-off as the tables already added; see
  `backend/prisma/CLAUDE.md`) and a Settings-page UI to collect them.
- Option 2: leave them unfilled permanently and accept that any ATS requiring phone
  will always abstain — measure via §03 how often this actually happens before
  deciding it's worth the schema change.

## E. Build a real test corpus for the generic engine (Phase 2 prerequisite)

**Why it matters**: `fieldTaxonomy.js`'s `SYNONYMS` list is a first guess at what
labels real forms use. It hasn't been tested against a single real non-ATS
application form yet.

**Method**: before writing the generic adapter, pull 15-20 real application forms
from the actual job sources this project fetches from (Remotive, Adzuna, Jooble
listings — follow their `applyUrl` and see where it actually lands, per the earlier
audit that found most of these are redirect/listing pages, not forms). Record every
field label seen. Diff against `SYNONYMS` in `fieldTaxonomy.js`. This is the concrete
input for §04's synonym-expansion work — don't skip straight to tuning without
first collecting real examples.

## F. Confirm session-state (storageState) reuse actually works

**Why it matters**: the whole point of saving `ApplyCredential.sessionStateEncrypted`
is to avoid re-logging-in (and re-hitting login CAPTCHAs) on every task. This has
never been executed once. Playwright's `storageState` reuse is well-documented in
general but ATS-specific session/cookie behavior (expiry, IP-binding, re-auth
prompts) is unverified here.

**Method**: once Phase 1 runs against a real Greenhouse/Lever/Ashby account, run the
adapter twice in a row for the same platform and confirm the second run's
`login()` call correctly detects "already logged in" (no login link/form found) via
the restored `storageState`, rather than attempting a fresh login every time.

## G. Anti-bot-detection risk assessment

**Why it matters**: Playwright's default headless Chromium is detectable by
fingerprinting scripts many ATS/CAPTCHA providers use. A detected bot gets more
CAPTCHAs, not fewer — which directly undermines the whole point of session reuse and
adds cost/friction to every run.

**Method**: research whether `playwright-extra` + a stealth plugin (or switching to
`chromium.launchPersistentContext` with more realistic browser fingerprint settings)
measurably reduces CAPTCHA-hit rate once §03's metrics are running. This is also a
point in favor of a managed provider (§B) — Browserbase/Browserless typically handle
fingerprint realism as part of the product, which a from-scratch Playwright setup
doesn't get for free.

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

### ✅ DONE 2026-08-19 — findings

Corpus built by visiting 20 real `applyUrl`s with a real headless Chromium, sampled
to span all 16 hosts that `resolvePlatform()` currently calls `generic`, and scanned
with the **real** `scanFields`/`bestMatch` from `fieldTaxonomy.js` (not a
reimplementation), so what follows is what the generic adapter would actually see.
Read-only — nothing was typed, uploaded, or submitted.

**Headline: only 1 of 20 (5%) landed on a directly fillable form.** The earlier
audit's suspicion was right, and then some:

| Verdict | Count | What it means |
|---|---|---|
| `LISTING_OR_REDIRECT_PAGE` | 9 | No form at all — a job description with an "Apply" link |
| `ATS_BEHIND_CUSTOM_DOMAIN` | 6 | A known ATS is behind the company's own domain |
| `OTHER` | 4 | Mostly listing pages with a search/newsletter box inflating the field count |
| `FILLABLE_FORM` | 1 | workingnomads.com, and only after a redirect to a *different* ATS |

**Finding 1 — 56% of "generic" isn't generic at all; it's Greenhouse.** Measured
across the whole database, not the sample: **611 of 1088** URLs that
`resolvePlatform()` returns `generic` for carry a `gh_jid=` query parameter, which is
Greenhouse's own job id. `resolvePlatform()` only looks at `hostname`, so a Greenhouse
board served on `samsara.com` / `coinbase.com` / `stripe.com` / `instacart.careers` /
`databricks.com` / `careers.airbnb.com` / `jobs.dropbox.com` / `asana.com` is invisible
to it. That is 611 jobs (21.8% of all active jobs) currently routed to a generic
engine that does not exist, instead of to the already-verified Greenhouse adapter.

**Finding 2 — the canonical Greenhouse URL does NOT work for these; the embed URL
does.** Rewriting to `job-boards.greenhouse.io/<company>/jobs/<gh_jid>` was probed on
6 of them and **all 6 redirected straight back** to the company's own careers page —
Greenhouse bounces the canonical board URL for embedded-board customers. What works
is the embed form URL the pages themselves link to:
`https://job-boards.greenhouse.io/embed/job_app?for=<company>&token=<gh_jid>`.
Probed on 4 (coinbase, samsara, stripe, instacart): **all 4 served a real application
form** with 2 file inputs and 30-52 typeable fields — including samsara and stripe,
whose own pages exposed no Greenhouse iframe or link at all. Any
resolve-the-real-destination step must use the embed URL, not the canonical one.

**Finding 3 — the verified Greenhouse adapter would work on those embed forms.**
Its hardcoded `#resume` selector matches 1 element on both embed pages probed. (Its
second selector, `input[type="file"][name*="resume" i]`, matches 0 — these inputs
carry `id="resume"` with an empty `name` — so the `#resume` half is doing all the
work. Worth knowing before anyone "simplifies" that selector pair.)

**Finding 4 — a real generic-engine bug: `resume_upload` fails on 4 of 4 real
Greenhouse forms.** The file input is labelled **"Attach"**, and
`SYNONYMS.resume_upload` is `['resume','résumé','cv','upload resume','attach resume']`
— `'attach resume'` is not a substring of `'attach'`, so no label match. It does have
`id="resume"`, but `scoreFieldForKey()` scores an id/name hit at `NAME_ATTR` (35),
below `MIN_CONFIDENCE_TO_FILL` (60), so it is discarded. Per §04 the resume upload is
"the strictest single gate" — so **every one of these forms abstains on the generic
path purely over the word "Attach"**, despite the id being an unambiguous signal.
Note this is the *generic* path only: the Greenhouse adapter never consults the
taxonomy for the resume field (Finding 3), so no currently-shipping adapter is
affected.

**Finding 5 — SYNONYMS is not the bottleneck, contrary to §04's expectation.** On the
one genuinely fillable form found (a JazzHR board at `applytojob.com`), the existing
synonyms matched every required field at confidence 80 with **no gaps** — first/last
name, email, phone, resume, cover letter, even salary expectation. §04 says the first
tuning lever is the synonym list; this corpus says the first lever is actually
*reaching a form at all*.

**Finding 6 — the true unknown remainder is 477 URLs across exactly 8 aggregator
hosts**: remoteok.com (100), weworkremotely.com (100), arbeitnow.com (97),
arbeitnow.co.uk (75), workingnomads.com (48), himalayas.app (20), mustakbil.com (20),
remotive.com (17). Every one sampled was a listing/redirect page, and the single
success among them (workingnomads) only worked by following through to a third-party
ATS. So the residual is not "unknown custom forms needing better synonyms" — it is
"aggregator pages needing a follow-the-apply-link step."

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

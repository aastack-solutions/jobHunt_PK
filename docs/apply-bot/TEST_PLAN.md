# Auto-Apply Bot & Application Tracking — Test Plan

One test-case checklist per feature (F1-F14), so implementation can be verified
feature-by-feature without skipping anything. Check items off as they pass — this
file is meant to be marked up, not just read.

**How to use this**: work through a feature's checklist right after building it, not
at the end of everything. Automated-test items (marked 🤖) belong in F10's actual
test suite — write them once, they run forever. Manual items (marked 🖐️) need a
human doing the action for real (a real posting, a real CAPTCHA, a real redeploy) —
these can't be automated away and shouldn't be skipped just because they're slower.

---

## F1 — Data Model & Credential Encryption

**Verified 2026-08-18 against a real Neon Postgres instance — see MEMORY.md.**

- [x] 🤖 `npx prisma migrate dev` applies cleanly to a fresh Postgres instance — all
      tables, indexes, and foreign keys created with no errors
- [x] 🖐️ `PUT /api/apply-credentials/greenhouse` with a valid username/password → 201,
      response body contains no ciphertext, iv, authTag, or plaintext secret
- [x] 🖐️ `GET /api/apply-credentials` → lists platform/isActive/hasSessionState only,
      never the encrypted or plaintext credential fields
- [x] 🤖 Encrypt→decrypt round trip (`cryptoService.encryptJSON`/`decryptJSON`)
      returns the exact original object for a representative payload
- [x] 🤖 `timingSafeEqualString`: same string → true; different string → false;
      mismatched length → false, no throw; `undefined` input → false, no throw
- [x] 🖐️ `PUT` twice for the same platform (update path) — confirm
      `sessionStateEncrypted`/`sessionStateIv`/`sessionStateAuthTag` are cleared to
      null (a new login invalidates the old session) — **found & fixed a real bug**:
      only `sessionStateEncrypted`/`sessionStateSavedAt` were being cleared, leaving
      `sessionStateIv`/`sessionStateAuthTag` orphaned; fixed in `applyCredentials.js`
- [x] 🖐️ `DELETE /api/apply-credentials/greenhouse` removes the row; a subsequent
      `GET` no longer lists it

## F2 — Backend Orchestration API

**Verified 2026-08-19 against a real Neon Postgres + Upstash Redis — see MEMORY.md.**

- [x] 🖐️ `POST /api/internal/apply-bot/trigger-select` with the correct
      `X-Cron-Secret` → 200, creates `ApplyTask` rows respecting `APPLY_BOT_DAILY_CAP`
      (verified both the normal case and cap=1 against 2 eligible jobs)
- [x] 🤖 Same request with a wrong or missing secret header → 401
- [x] 🖐️ Kill switch off (`apply_bot:enabled` = `false` in Redis) → response shows
      `enabled: false`, zero tasks created, but the sweep still ran (`swept` in the
      response is populated, not skipped)
- [x] 🖐️ Run selection twice back-to-back with nothing having progressed — second
      run creates zero new tasks for jobs already `queued`/`running`/etc. (dedupe)
- [x] 🖐️ A job at a company the user already has an `Application` for (within 90
      days) is skipped even if it's a different specific job posting
- [x] 🖐️ `GET /api/internal/apply-bot/tasks/:id` with the correct
      `X-Apply-Bot-Secret` → 200, decrypted credential matches what was stored,
      task flips to `status: 'running'`
- [x] 🖐️ Calling the claim endpoint twice for the same task doesn't error or corrupt
      state (idempotent re-claim)
- [x] 🤖 **Idempotency regression**: `POST` a `submitted` callback for a task, then
      `POST` a `failed` callback for the *same, now-terminal* task — confirm the
      second call returns `alreadyTerminal: true` and does NOT change the task's
      status, and does NOT create a second `Application` row — now a permanent
      automated test, `test/applyTaskCallback.test.js` (un-skipped)
- [x] 🖐️ A `submitted` callback creates an `Application` with correct
      `source: 'auto_apply_bot'`, `resumeId`, and `applyUrl`, and backfills
      `ApplyTask.applicationId` to point at it
- [x] 🖐️ Hammer `/api/jobs` (public) past its rate limit, then immediately hit
      `/api/internal/apply-bot/trigger-select` — confirm the internal call is NOT
      429'd by the public bucket (separate `internalLimiter`) — confirmed: 100
      requests passed then 429s started, `trigger-select` still returned 200

## F3 — apply-bot Service Scaffold & Worker Runtime

**Verified 2026-08-19 (local Windows dev, no Docker) — see MEMORY.md.** Two items
are genuine environment blockers, not skipped carelessly: no Docker on this machine,
and Windows doesn't reliably deliver `SIGTERM`/`SIGINT` between unrelated processes
(two independent delivery attempts both silently killed the target instead of
invoking its handler) — both need the real Railway Linux deployment to test for real.

- [ ] 🖐️ **BLOCKED — no Docker installed on this machine.** `docker build` succeeds
      for `backend/apply-bot/` — not attempted; Dockerfile reviewed and matches the
      verified-working native `npm install` + `npx playwright install chromium` steps
- [x] 🖐️ `npm install && npx playwright install --with-deps chromium` completes with
      no errors — bumped the stale `1.49.1` pin to `1.62.1` (current stable) first,
      per the plan's own flagged risk; resolved Chromium 151.0.7922.34
- [x] 🖐️ `GET /health` on the apply-bot service → `{ status: 'ok', service: 'apply-bot' }`
- [x] 🖐️ Manually enqueue an `apply-bot-tasks` job → worker claims it, launches a
      real browser, reaches `page.goto()` on the target URL — full pipeline verified:
      claimed → navigated to a real `greenhouse.io` page → scanned fields → correctly
      abstained (`skipped_low_confidence`, since the target wasn't a real application
      form) → reported back, ~66s round trip
- [ ] 🖐️ **BLOCKED — Windows signal-delivery limitation, not attempted successfully.**
      Graceful shutdown (`SIGTERM` mid-task → `worker.close()` waits for the task):
      tried `taskkill` without `/F` (Windows refuses: "can only be terminated
      forcefully"), then `process.kill(pid, 'SIGTERM')` and `process.kill(pid,
      'SIGINT')` from a separate Node process (both silently force-killed the target
      with no shutdown log at all, rather than invoking its handler) — a known Node-
      on-Windows limitation for cross-process signal delivery, not something this
      environment can test reliably. The code was reviewed instead: `server.js`
      registers both signals against the same `shutdown()` function, which correctly
      awaits `worker.close()` (a BullMQ-library-guaranteed wait-for-current-job) before
      `process.exit(0)`. Needs re-verification on the actual Railway (Linux) deploy.
- [x] 🖐️ A deliberately-hung task (e.g. point at a URL that never resolves) gets
      force-failed with `failureClass: 'TIMEOUT'` at `TASK_DEADLINE_MS`, and the
      next queued task picks up normally afterward (queue isn't stuck) — tested with
      a real network hang (a `*.greenhouse.io` hostname via nip.io wildcard DNS
      resolving to a public TEST-NET blackhole address, no local system changes
      needed) and a temporarily-shortened deadline (`TASK_DEADLINE_MS_OVERRIDE`, new
      dev-only env var, unset in every real deployment): force-failed at the deadline,
      next task started 4s later — confirmed not stuck
- [x] 🤖 **SSRF regression**: `isBlockedIp()` against the 18 known addresses (AWS/GCP
      metadata `169.254.169.254`, loopback, RFC1918 boundaries incl. `172.16.0.0`/
      `172.31.255.255`/`172.32.0.0`, CGNAT, public IPv4/IPv6, the IPv4-mapped-IPv6
      bypass case `::ffff:169.254.169.254`) — all must classify correctly
- [x] 🖐️ Confirm the SSRF guard does NOT over-block: a real navigation to
      `boards.greenhouse.io` (or another legitimate ATS host) succeeds normally —
      confirmed twice (standalone script and the real worker run above), page loaded
      and returned its real title
- [x] 🖐️ **`maxStalledCount: 0` regression**: `kill -9` the apply-bot process mid-task,
      restart it, confirm the interrupted task is NOT silently auto-reprocessed by
      BullMQ (should sit at `running` until the sweep — F2 — resolves it) — confirmed
      via the DB row (unchanged `startedAt`, still `running` after restart) AND via
      BullMQ's own log ("job stalled more than allowable limit" — failed at the
      queue level rather than silently redelivered, exactly per `maxStalledCount: 0`)

## F4 — Lever Adapter (Browser Automation)

**Corrected 2026-08-17**: no API shortcut exists for Lever (its apply endpoint also
needs an employer-owned API key) — this is browser automation, same test shape as
F5/F6, not an API-payload test.

**Verified 2026-08-19 against 5 real, currently-open postings — see MEMORY.md.**

- [x] 🖐️ A real, currently-open `jobs.lever.co` posting's `applyUrl` resolves to
      `adapterUsed: 'lever'` via `resolveAdapter()` — confirmed for all 5 postings
      tested below
- [x] 🖐️ Against 3+ different real, currently-open Lever postings, shadow mode
      correctly fills name / email / resume upload — verify against the captured
      screenshots, not just the `fieldsFilled` JSON — tested against **5** (Palantir,
      Apollo Research, Veeva, H1, Velo3D), each cross-checked two ways: the
      adapter's own `fieldsFilled`/`confidence` return value AND an independent
      post-fill DOM read of the actual input values/file count (not just trusting
      the adapter's self-report), plus before/after screenshots (one visually
      inspected directly — resume filename + "Analyzing resume..." spinner +
      name/email all correctly populated)
- [x] 🖐️ Resume file attaches correctly via the real DOM's file input
      (`input[name="resume"]` — confirm this selector against a live posting) —
      confirmed exact match, `resumeFileCount: 1` after fill on all 5 postings
- [x] 🖐️ Confirm Lever postings are guest-apply (no login) across the real postings
      tested — `login()` should be a correct no-op; flag if a gated board is found —
      confirmed on all 5, no gated board found
- [x] 🖐️ Login-page regression (same as F5): an expired/invalid stored session
      correctly triggers `failureClass: 'AUTH'` via `looksLikeLoginPage()` — the
      generic mechanism (fixture-tested, F10) now passes for real with Playwright
      installed; additionally confirmed directly against real Lever DOM
      (`looksLikeLoginPage()` correctly returns `false` — not a false positive)
- [x] 🖐️ Record whether any tested Lever posting presents a CAPTCHA — not confirmed
      either way by research; this is the test that answers it — **confirmed
      present on all 5**: real hCaptcha widget (`.h-captcha` div, iframe, hidden
      `h-captcha-response` input, hCaptcha script tag) — Lever presents a CAPTCHA
      as standard, not an edge case, same posture now confirmed as F5's Greenhouse
- [ ] 🖐️ (Live mode, only once trusted) a real application submits and a
      confirmation is verifiable on Lever's/the employer's side — **deliberately
      not attempted**: this is F12's gate (live-mode rollout), not F4's; shadow
      mode (stops one click before Submit) was used throughout, no real
      applications were ever submitted to any of these employers

**Two real bugs found and fixed during this verification** (see MEMORY.md for
detail): `leverAdapter.js`'s `locateSubmit()` matched neither of Lever's two real
submit-shaped buttons, and `captchaDetector.js`'s `isAlreadySolved()` checked for a
`<textarea>` response element when Lever's real hCaptcha integration uses
`<input type="hidden">`.

## F5 — Greenhouse Adapter

**Verified 2026-08-19 against 5 real, currently-open postings — see MEMORY.md.**
Real-world finding first: `boards.greenhouse.io` (the domain the adapter's own
comments and this test plan originally assumed) has been fully replaced by
`job-boards.greenhouse.io` — several search-result URLs on the old domain all
404'd/redirected. All 5 postings below are on the new domain.

- [x] 🖐️ Against 3+ different real, currently-open Greenhouse postings, shadow mode
      correctly fills first name / last name / email / resume upload — verify
      against the captured `before-fill`/`after-fill` screenshots, not just the
      `fieldsFilled` JSON — tested against **5** (Sourcegraph ×3, tastytrade,
      ZipRecruiter), cross-checked via direct DOM reads of the actual input values
      (not just `fieldsFilled`'s self-report) plus full-page before/after
      screenshots. Resume upload needed a second look: Greenhouse's React form
      unmounts/replaces the `#resume` input once a file is accepted, so
      re-querying it afterward always shows 0 files — confirmed this is a UI
      implementation detail, not a failure, by checking the accepted filename
      appears in the rendered page text instead (poll-based, since that
      re-render is async — a fixed-delay check missed it non-deterministically
      on 3/5 postings before switching to a poll)
- [x] 🖐️ A posting with a required custom question outside the taxonomy is
      recorded as `unmapped` in `fieldsFilled`, never guessed at — every tested
      posting had several custom "question_NNNN" fields (interview availability,
      work authorization, etc.); none were ever filled or guessed at. Precision
      note: the adapter's fallback loop only explicitly records `unmapped` for
      `phone`/`linkedin_url`/`portfolio_url` specifically (confirmed present as
      required fields on 4/5 postings) — arbitrary other custom questions are
      silently left untouched entirely rather than explicitly flagged, which is
      the same "never guess" safety property, just without a label in the JSON
- [x] 🖐️ A posting protected by (possibly invisible) reCAPTCHA fails with
      `failureClass: 'CAPTCHA'` rather than silently mis-filling or crashing —
      reCAPTCHA (`iframe[src*="recaptcha"]`) confirmed present on **all 5**
      postings tested. On 4/5 it was visible immediately on page load; on 1
      (ZipRecruiter) it was NOT present before filling but appeared afterward —
      a real, observed instance of the "sometimes invisible, triggered by
      behavioral signals" case the plan flagged, confirming worker.js's existing
      pre-fill AND post-fill `detectCaptcha()` calls are both genuinely needed
- [ ] 🖐️ **Login-page regression**: point the adapter at an expired/invalid stored
      credential's session — confirm it fails with `failureClass: 'AUTH'` and the
      specific "landed on a login page" reason, not a confusing `LOW_CONFIDENCE`
      — **not exercised against a real gated board** (all 5 tested were
      guest-apply, no login required); the generic `looksLikeLoginPage()`
      mechanism itself is fixture-tested and passing (F10) and was confirmed to
      correctly return `false` (not a false positive) against all 5 real pages
- [x] 🤖 A test fixture with only weak/ambiguous field signals produces
      `skipped_low_confidence`, not a low-confidence fill
- [x] 🖐️ Resolve the React-hydration timing question (`docs/apply-bot/02` §4): does
      the classic board need a `waitForSelector` before fields exist? Record the
      answer and fix the adapter if needed — **resolved: no.** Tested with
      worker.js's exact real navigation option (`domcontentloaded` only, zero
      extra wait) immediately followed by `fillApplication()` — filled correctly
      every time. Playwright's own locator-based `.fill()`/`.setInputFiles()`
      already auto-wait for the target element, so no explicit
      `waitForSelector` was ever needed; no adapter change made

## F6 — Ashby Adapter

**Verified 2026-08-19 against 5 real, currently-open postings — see MEMORY.md.**

- [x] 🖐️ Against 3+ different real, currently-open Ashby postings, shadow mode
      correctly fills the required fields — verify against screenshots — tested
      against **5** (Valon, Ashby itself, Ramp ×2, Linear), each cross-checked via
      a direct DOM read of the actual filled values (not just `fieldsFilled`'s
      self-report) and the resume filename confirmed present in the rendered page
- [x] 🖐️ A required custom question outside the taxonomy is recorded `unmapped`,
      never guessed — phone/LinkedIn/portfolio/GitHub all correctly recorded
      `unmapped` wherever present, never filled with wrong data; other custom
      questions (not in the `phone`/`linkedin_url`/`portfolio_url` check list)
      silently left untouched, same precision note as F5
- [x] 🖐️ Determine (previously unconfirmed by research) whether Ashby postings
      commonly present a CAPTCHA — record the finding, build detection/handling
      accordingly if so — **not observed on any of the 5 postings tested**,
      unlike Lever and Greenhouse (100% in their own sessions). No detection
      changes needed since none was seen; not proof no Ashby board ever uses one
- [ ] 🖐️ Login-page regression (same as F5-06) — confirm `AUTH` failure on a stale
      session rather than a confusing fill attempt — **not exercised against a
      real gated board** (all 5 tested were guest-apply); the generic
      `looksLikeLoginPage()` mechanism is fixture-tested (F10, passing) and
      confirmed to correctly return `false` against all 5 real pages
- [x] 🤖 Low-confidence abstain regression (same as F5-05)
- [x] 🖐️ Given Ashby's heavier React rendering, specifically verify field-scan
      timing — confirm `fieldTaxonomy.scanFields()` isn't running before the form
      has actually rendered — **confirmed this was a real bug, not a theoretical
      risk**: calling `fillApplication()` immediately after `domcontentloaded`
      (worker.js's actual real navigation option, zero extra wait) found **zero
      fields** on Ashby's inline-form postings (the equivalent Greenhouse test,
      F5, passed instantly with no fix needed — Ashby's `scanFields()` uses a raw
      `page.evaluate()` with no built-in auto-wait, unlike Greenhouse/Lever's
      Locator-based fill calls). Fixed via an explicit `waitForSelector` in
      `ensureApplicationFormVisible()`; re-verified against the exact same
      zero-extra-wait scenario afterward — all 3 re-tested postings (1 inline,
      2 click-through) filled correctly

**Second real bug found and fixed alongside the timing one**: 2 of the 5 postings
(Ashby's own board, one Ramp posting) render the application form on a separate
`/application` sub-path reached only by clicking an "Apply for this Job" control —
`fillApplication()` used to assume the form was always already on the page, so it
would scan an empty page on those and abstain with `skipped_low_confidence`,
never reaching a real, fillable form one click away. Fixed by the same
`ensureApplicationFormVisible()` function (falls back to finding and clicking the
control if the name field isn't found within a few seconds).

## F7 — CAPTCHA / Bot-Challenge Live-View

**Verified 2026-08-19 against a real hCaptcha on a real, currently-open Lever
posting — see MEMORY.md.** Status generalized from `paused_captcha` to
`paused_human` + `pauseReason` throughout (schema, callback API, sweep,
selection dedupe) per the plan's own required design point.

- [x] 🖐️ A real CAPTCHA hit sets `ApplyTask.status` to the pause state with
      `pauseReason: 'captcha'`; the browser session stays open (not closed) —
      confirmed against a real posting: `status: 'paused_human'`,
      `pauseReason: 'captcha'`, `captchaDetectedAt` set, session kept alive
      (proven by the live-view successfully screenshotting it afterward)
- [x] 🖐️ The live-view WebSocket delivers frames at roughly 1-second cadence,
      matching Contract B's `{ type: 'frame', ... }` shape exactly — confirmed:
      real JPEG frames (1280×720, ~28KB base64 each) over an authenticated
      connection (session-cookie auth through the backend proxy, verified
      against the real Redis session store — see MEMORY.md for how)
- [ ] 🖐️ Remote mouse/keyboard events sent from the frontend actually register in
      the real browser (e.g. click a checkbox via the live view, confirm it's
      checked in the actual page) — **not exercised**: the `mark-resolved`
      signal path was tested end-to-end (see below), but a mouse/keyboard event
      round-trip specifically wasn't; the denormalization math was reviewed by
      inspection, not proven against a real click
- [x] 🖐️ After a human solves the CAPTCHA and signals resolution, the task resumes
      automatically — confirmed: `mark-resolved` correctly resolved
      `waitForHumanResolution()`'s promise, the task re-checked the challenge
      (deliberately not trusting the signal blindly), and — since the real
      CAPTCHA genuinely wasn't solved in this test — correctly reported
      `failed`/`CAPTCHA` with "still present after being marked resolved" rather
      than either hanging or proceeding to fill a form behind a live CAPTCHA.
      This proves the resume mechanism and the safety re-check both work; a
      true "solved and continues to fill" run needs an actual human solving a
      real CAPTCHA through the (not-yet-built, F11) frontend live-view component
- [x] 🤖 **Critical regression, flagged explicitly in the plan**: a task paused
      for a CAPTCHA is NOT killed by `TASK_DEADLINE_MS` (3 min) — confirmed with
      real evidence, not just code review: using
      `TASK_DEADLINE_MS_OVERRIDE=8000`/`PAUSE_TIMEOUT_MS_OVERRIDE=25000`, a
      paused task survived past the 8-second task deadline untouched and only
      timed out at ~27 seconds (matching the pause timeout, not the task
      deadline) — the exact scenario the plan warned would silently break
- [x] 🖐️ An unsolved CAPTCHA times out at its own (longer, ~10 min in production,
      tested via the override above) deadline and fails cleanly, closing the
      browser session — confirmed in the same test: `failureClass: 'CAPTCHA'`,
      `failureReason` correctly states the timeout duration
- [ ] 🖐️ An email-verification challenge is correctly detected and paused with
      `pauseReason: 'email_verification'`, with distinct on-screen instructions
      from the CAPTCHA case — **not exercised against a real occurrence**
      (research found this is real but comparatively rare/hard to reproduce
      deterministically); `detectEmailVerification()`'s text-pattern matching and
      `worker.js`'s handling are symmetric with the CAPTCHA path (same
      `waitForHumanResolution()`, same re-check-before-trusting logic) and share
      its test coverage by construction, but the detection patterns themselves
      are unverified against a real prompt
- [x] 🖐️ Confirm apply-bot has no public networking — the live-view WS is only
      reachable through the authenticated backend proxy — the actual network-
      level unreachability is a Railway infrastructure setting, not testable
      locally, but the defense-in-depth application-level check IS tested and
      real: a direct connection to apply-bot's own WS port with a missing or
      wrong `X-Apply-Bot-Secret` is rejected with a plain HTTP 401 *during the
      upgrade handshake* (via `verifyClient`, not after accepting the
      connection — **a real bug found and fixed here**: the original
      connection-handler-based check let the WebSocket handshake complete, and
      the client's own `open` event fire, before the server got around to
      closing it — confirmed by testing both ways). Backend-proxy-side
      authentication (session cookie required, task ownership verified) is also
      confirmed rejecting both a missing cookie and a task the caller doesn't own

## F8 — Generic Engine (Non-ATS Sources)

**Scoping pass done 2026-08-19** (see `01-research-plan.md` §E findings and
TECHNICAL_PLAN's rewritten F8 DoD). F8 now splits into F8a (platform re-resolution,
needs sign-off), F8b (the `resume_upload` scoring bug) and F8c (aggregator
resolve-the-destination step). **F8b is done and verified**; F8a and F8c are not
started, so the unchecked items below still stand.

- [x] 🤖 **F8b** — `bestMatch` finds `resume_upload` on a real Greenhouse embed form
      whose file input is labelled only "Attach", picks the `id="resume"` input over
      the `id="cover_letter"` one, refuses a text field with the same id, and honours
      a word boundary so `cv` cannot hit `cvv_scan` — 5 browser-free tests in
      `backend/apply-bot/test/fieldTaxonomy.test.js`
- [x] 🖐️ **F8b, against live forms** — the same 4 real Greenhouse embed forms that
      previously scanned as `FORM_BUT_UNMAPPED` (required field missing) all scan as
      `FILLABLE_FORM` after the fix, and re-scanning the original 20-URL corpus
      produced an identical verdict tally, i.e. no new false positives on the 9
      listing/redirect pages
- [x] 🖐️ **Gate regression**: with `APPLY_BOT_GENERIC_ENABLED=false`, confirm
      generic-platform jobs never get an `ApplyTask` created during selection —
      verified live against real Neon: a full selection run created **70 tasks, all
      `greenhouse`, zero `generic`**, while 477 generic-platform jobs sat eligible in
      the table
- [x] 🖐️ Once enabled, a real non-ATS job's `applyUrl` gets scanned and its
      required fields matched with a reasonable confidence score — covered by the
      fixture-DOM test below plus the live §E corpus, where the one genuinely
      fillable non-ATS form (a JazzHR board) matched every required field. Note the
      flag stays **false**: §E found only 1 in 20 non-ATS `applyUrl`s is a form at
      all, so enabling it today would mostly produce abstains against listing pages
- [x] 🤖 A deliberately unusual/unmappable test form produces
      `skipped_low_confidence`, not a wrong guess — `genericAdapter` returns
      confidence 30 (under `worker.js`'s threshold of 60) and, critically, **writes
      nothing** into the unrelated text boxes. Also asserted from the other
      direction: finding only the resume upload is not enough to carry a form over
      the line. See `backend/apply-bot/test/adapters.test.js`
- [x] 🤖 **SSRF regression, specifically for this feature**: confirm a generic-engine
      task attempting to navigate to a private/internal address is blocked by the
      SSRF guard — this is the scenario the guard was built ahead of time for.
      `isSafeUrl` refuses the cloud metadata endpoint, loopback (including the
      backend's own internal API port), RFC1918 and non-http schemes, while still
      allowing a real public posting through
- [x] 🤖 **F8a** — a `gh_jid` parameter resolves to `greenhouse` on 8 real
      employer domains, a non-numeric `gh_jid` is refused, the rewrite produces the
      slug-free embed URL, and URLs that already work are left untouched
- [x] 🖐️ **F8a, end to end through the real pipeline** — a live selection run
      stored **17 of 70** tasks with `ApplyTask.applyUrl` rewritten to
      `boards.greenhouse.io/embed/job_app?token=...` while `Application.applyUrl`
      still points at the employer's own posting. Separately, 7 freshly-sampled
      employer-hosted postings across 7 different employers (none previously probed)
      all served a real application form at the rewritten URL

## F9 — Failure Measurement & Alerting

All four verified 2026-08-19 against the real Neon database with the backend
running locally (branch `f9-failure-measurement`).

- [x] 🖐️ Dashboard's `applyBotNeedsReview` count matches the actual number of
      `unknown_outcome` rows in the database — verified live: a freshly-registered
      user read `0` while the database globally held 3 `unknown_outcome` rows
      belonging to another user (so this also proves the count is correctly
      per-user, not global), then `2` after seeding exactly 2 rows for that user
- [x] 🖐️ `SchedulerAlert` shows the apply-bot staleness banner only after
      `apply-bot-select` has run at least once and then gone stale >25h — confirm
      NO false alarm for a user who's never enabled the feature — verified by
      extracting the component's real `applyBotOverdue` expression out of
      `SchedulerAlert.jsx` and evaluating it: `null` → no banner (the never-enabled
      case), the live API's actual value (a run ~4h old) → no banner, a 26h-old
      timestamp → banner. **Caveat**: this is logic-level, not a rendered-component
      test — the frontend has no test tooling (no vitest/RTL in `package.json`), and
      the `null` case could not be produced end-to-end without deleting this
      database's real `apply-bot-select` SchedulerLog history, which wasn't worth it
- [x] 🖐️ `SchedulerAlert` shows the "needs review" banner when the
      `unknown_outcome` count is > 0, and it disappears once resolved — verified
      live through `GET /api/dashboard` across the full cycle: 0 → 2 → 1 → 0 as the
      seeded tasks were resolved one at a time. The banner itself is
      `needsReview = applyBotNeedsReview > 0`, evaluated from source alongside item 2
- [x] 🤖 Per-adapter success-rate query (`docs/apply-bot/03`) returns correct
      numbers against known seeded test data — now automated, not manual:
      `backend/test/applyBotFailureReport.test.js`, 5 tests, all passing against the
      real database. Covers the resolved-only denominator (in-flight excluded), the
      no-data-yet `null` vs. a real `0%`, the time window, the nullable
      `failureClass` bucket, and the persisted `SchedulerLog` row

## F10 — Testing & Verification Harness

- [x] 🤖 `npm test` exists and runs in under a minute — `node -r dotenv/config --test`
      (dotenv preload added 2026-08-19 so DB-dependent tests pick up `.env`
      automatically when present), both `backend/` and `backend/apply-bot/`.
      **78 passing / 0 skipped / 0 failing in 48s** as of F10, up from 43 total at
      the start of 2026-08-19 (+5 F9, +5 F8b, +11 F8a/F8c, +14 F10). With no
      `DATABASE_URL` present it still passes clean: 57 passing / 8 skipped / 0
      failing in 5s, so a plain CI checkout is unaffected
- [x] 🤖 `cryptoService` round trip (incl. tampered-ciphertext and wrong-iv/authTag
      cases) — `backend/test/cryptoService.test.js`
- [x] 🤖 `applyBotPlatform.resolvePlatform`/`requiresCredential` against real
      fixture URLs — `backend/test/applyBotPlatform.test.js`
- [x] 🤖 `timingSafeEqualString` — same file as the crypto round trip
- [x] 🤖 The 18-case SSRF guard suite — `backend/apply-bot/test/ssrfGuard.test.js`
- [x] 🤖 `adapters/index.js`'s `resolveAdapter()` against real ATS URLs, plus a
      guard confirming every registered adapter is currently browser-based —
      `backend/apply-bot/test/adapters.test.js`
- [x] 🤖 **Un-skipped 2026-08-19** (F2 verification session, real Neon DB): the
      callback idempotency guard (`backend/test/applyTaskCallback.test.js`) and
      `applyBotSweep`'s staleness thresholds (`backend/test/applyBotSweep.test.js`)
      — both self-skip gracefully when `DATABASE_URL`/a running backend aren't
      available, so `npm test` still passes clean in a DB-less environment
- [x] 🤖 ~~Blocked on a real Playwright install~~: `fieldTaxonomy.bestMatch` against
      a fixture HTML page, `looksLikeLoginPage` against fixture pages — **unblocked
      2026-08-19**, Playwright's Chromium is installed and both run for real (they
      were the last remaining browser-dependent skips)
- [x] 🤖 **The callback test no longer needs a backend started by hand.** It used
      to require `npm run dev` in another terminal, which meant it silently skipped
      on essentially every run — a test nobody was actually running. It now mounts
      the `internal.js` router on a throwaway server on an ephemeral port, so a live
      `DATABASE_URL` is the only external thing it needs. `TEST_BASE_URL` still
      points it at a real backend when you want the full middleware stack
- [x] 🤖 **`applyBotSelect.js`'s selection safety rules** — 11 tests in
      `backend/test/applyBotSelect.test.js` covering the daily cap, the
      already-capped case, in-flight dedupe, `unknown_outcome` blocking a job
      indefinitely, company dedupe (case-insensitively), the missing- and
      inactive-credential skips, the F8 generic gate in both positions, the F8a URL
      rewrite, non-https refusal, and inactive jobs. Written because a coverage run
      put this file — which holds every rule that stops the bot doing something it
      should not — at **16.98%**; it is now **69.75% line / 100% branch**
- [x] 🤖 **Coverage is measurable on demand**: `npm run test:coverage`
      (`--experimental-test-coverage`, no new dependency). See the F10 section of
      TECHNICAL_PLAN for the numbers and for what is deliberately still uncovered

## F11 — Credential & Session Management UX

All verified 2026-08-19. Items 1-3 were driven through the real UI in a real
Chromium against the built frontend served by the backend — 9/9 checks passed.

- [x] 🖐️ A user can add a Greenhouse credential through the Settings UI with no API
      client/Postman needed — done end to end in a browser: open Settings, press
      Add, fill username/password, save, and the row flips to a **Saved** badge
- [x] 🖐️ The credential list never displays the secret after creation, only
      platform/status/`hasSessionState` — asserted three ways after a reload: the
      password string appears nowhere in the rendered text, nowhere in the DOM, and
      nowhere in the `/api/apply-credentials` response, while the platform is still
      correctly listed as configured
- [x] 🖐️ Deleting a credential means subsequent selection correctly skips that
      platform (no credential → skip, per `applyBotSelect.js`) — the delete half was
      done through the UI (with a confirmation step, since it silently stops the bot
      applying to that platform); the skip half is covered by F10's
      `applyBotSelect.test.js` ("a platform needing a credential is skipped when
      none is stored" and the inactive-credential case)
- [x] 🤖 `ApplyBotLiveView.jsx` renders frames correctly against a stubbed WS server
      matching Contract B — the protocol half is now a pure module,
      `frontend/src/lib/liveViewProtocol.js`, with 16 tests in
      `frontend/test/liveViewProtocol.test.js` covering every server-to-client shape
      including a frame whose image is not a `data:` image URL, which is refused
      before it can reach an `<img>` src
- [x] 🤖 Mouse/keyboard capture in the live-view component correctly normalizes
      coordinates to the documented 0..1 range before sending — corners, centre,
      clamping for a pointer that left the canvas mid-drag, and a not-yet-laid-out
      canvas reporting zero width are all asserted

**2026-08-20 follow-up (code review)**: carried forward all six previously-
established fixes from F2/F7/F8/F9/F10 (`worker.js`/`internal.js` mode-checks,
`genericAdapter.js`'s `locateSubmit`/`fillByIndex`, `applyBotFailureReport.js`'s
`unknownOutcome`, `applyBotSelect.test.js`'s Redis-probe hang fix,
`applyTaskCallback.test.js`'s fixture mode) — this branch predates all of them.
Full verification: apply-bot suite 38/38 pass; frontend suite 16/16 pass;
`npm run build` succeeds (2327 modules, matches this branch's own claim).

**Flagged, not fixed — a narrow pause-reason staleness gap.**
`ApplyBotLiveView.jsx`'s `onmessage` handler has a `'pause'` case that updates
`reason`/`instructions` mid-session ("the reason can change mid-session... follow
it rather than trusting the mount-time prop") — but `backend/apply-bot/src/
liveView.js` never actually sends a `type: 'pause'` message; it only ever sends
`'frame'` and `'resumed'` (confirmed by reading the file directly). Combined with
two other facts — `AutoApply.jsx`'s `liveTask` state is a one-time snapshot never
refreshed from the polled `tasks` list while the modal is open, and
`ApplyBotLiveView`'s `useState(pauseReason)` only captures its prop at mount
time, not on every re-render — a task that hits a CAPTCHA, gets resolved, then
hits a DIFFERENT challenge type (e.g. an email-verification code) later in the
SAME session would show stale "solve the CAPTCHA" instructions instead of the
code-entry UI. Judged low-frequency in the CURRENT architecture: per `worker.js`,
each challenge triggers its own independent `waitForHumanResolution()`
pause/report/re-check cycle rather than a fluid in-place transition, so a second
challenge very likely produces a fresh `paused_human` report the human would see
via the task list (which F11's own `ACTIVE_STATUSES` fix correctly keeps polling)
rather than a silent same-session change — but the WS-level "reason can change
mid-session" mechanism this component's own comment describes doesn't actually
work as written, and closing it properly would mean coordinating a real fix
across three files/layers rather than a narrow bug fix. Recorded here rather than
silently left, or "fixed" with an untested multi-file change under time pressure.

## F12 — Live-Mode Rollout & Safety Ops

- [ ] 🖐️ **Kill-switch drill**: flip `apply_bot:enabled` off mid-run, confirm no new
      tasks are created; flip back on, confirm selection resumes normally
- [ ] 🖐️ The `apply-bot-select` repeatable job actually fires on its own schedule
      without a manual trigger (and the sweep runs alongside it)
- [ ] 🖐️ A real Railway redeploy of the apply-bot service mid-task does not lose or
      duplicate a result — end-to-end proof that graceful shutdown + the increased
      grace period actually work together, not just individually
- [ ] 🖐️ Flipping `APPLY_BOT_MODE` to `live` for one adapter/user produces a real,
      independently-verifiable application on the employer's/ATS's side

## F13 — Unified Application Tracking

- [ ] 🖐️ Migration applies cleanly (`source`, `resumeId` columns present)
- [ ] 🖐️ Manual flow: clicking "Mark as Applied" in `CoverLetterModal` creates an
      `Application` with `source: 'manual'`, `applyUrl` populated from the job, and
      `resumeId` set to the currently-active resume
- [ ] 🖐️ Bot flow: a `submitted` `ApplyTask` creates an `Application` with
      `source: 'auto_apply_bot'`, and `ApplyTask.applicationId` correctly points
      back at it
- [ ] 🖐️ Re-opening the modal for an already-tracked job shows the disabled
      "Applied" state, not an active "Mark as Applied" button
- [ ] 🤖 An application with `status: 'applied'` and `appliedAt` 15 days in the past
      returns `isGhosted: true`; one from yesterday returns `false`
- [ ] 🤖 `isGhosted` is `false` for `offer`/`rejected`/`withdrawn` regardless of age
- [ ] 🖐️ CSV export includes the `source` and `applyUrl` columns
- [ ] 🖐️ Dashboard's `autoAppliedCount`/`ghostedCount` match the actual underlying
      data

## F14 — Email-Based Status Auto-Detection

Not built — these are acceptance criteria for whoever implements it, not tests to
run today.

- [ ] The OAuth app stays in Google Cloud Console's "Testing" publishing mode with
      the team's real users added as named test users — confirmed NOT in
      "Production" mode (this is what avoids the CASA audit requirement)
- [ ] The stored refresh token is encrypted via `cryptoService.js`'s existing
      scheme and is never logged in plaintext anywhere, including error logs
- [ ] The sync job's Gmail query only fetches messages matching the job-related
      filter — verify it isn't pulling the whole inbox
- [ ] A detected status change lands as a pending suggestion and never silently
      overwrites the real `Application.status`
- [ ] Approving a suggestion updates the status correctly; ignoring/rejecting one
      leaves the status untouched
- [ ] Disconnecting the integration deletes or invalidates the stored refresh token

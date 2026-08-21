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

**2026-08-20 follow-up (code review fixes)**: the review found 3 real issues this
original verification pass missed, all now fixed:
1. **Critical**: `internal.js` created an `Application` for any `status:'submitted'`
   callback regardless of `task.mode` — the code comment said "live mode only" but
   nothing enforced it. A shadow-mode task reporting `submitted` (worker bug,
   misclassification) would have silently created a real Application. Fixed —
   gated on `task.mode === 'live'`, with a warning logged if a shadow-mode task
   ever hits this branch (it shouldn't). New test added specifically for this case.
2. `npm test` preloaded the real `.env` unconditionally, so having `DATABASE_URL`
   configured for normal dev work was enough by itself to make the DB-integration
   tests silently create/delete real rows on every run. Fixed — both DB test files
   now require an explicit `RUN_DB_TESTS=true` opt-in, skip by default otherwise.
3. `applyTaskCallback.test.js`'s fixture setup could leak a User row if it failed
   partway through (outside the try/finally). Fixed — fixture is now a mutable
   object populated incrementally, so cleanup can act on partial state too.

**Re-verified in this environment** (no local Redis available — see `MEMORY.md`):
`applyBotSweep.test.js`'s two tests ran for real against the live Neon DB with
`RUN_DB_TESTS=true` and passed (confirmed a real stale `running` task actually swept
to `unknown_outcome`). The HTTP-based `applyTaskCallback.test.js` (idempotency guard
+ the new shadow-mode fix) could **not** be re-run here — it needs a running backend
instance, which needs Redis for sessions, which this environment doesn't have.
Correctly skips with a clear reason rather than silently passing or failing. This is
exactly the kind of gap the original 2026-08-19 pass (which apparently had working
Redis via Upstash) wouldn't have hit — worth running this specific test for real
once Redis is available, to close the loop on the mode-check fix.

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

- [ ] 🖐️ `docker build` succeeds for `backend/apply-bot/`
- [ ] 🖐️ `npm install && npx playwright install --with-deps chromium` completes with
      no errors; note the actual resolved Playwright version against the stale-pin
      finding (bump `package.json` if it resolved something unexpectedly old)
- [ ] 🖐️ `GET /health` on the apply-bot service → `{ status: 'ok', service: 'apply-bot' }`
- [ ] 🖐️ Manually enqueue an `apply-bot-tasks` job → worker claims it, launches a
      real browser, reaches `page.goto()` on the target URL
- [ ] 🖐️ **Graceful shutdown**: start a task, send `SIGTERM` to the process mid-task
      — confirm `worker.close()` waits for that task to actually finish (check logs
      for "worker closed cleanly") rather than killing it outright
- [ ] 🖐️ A deliberately-hung task (e.g. point at a URL that never resolves) gets
      force-failed with `failureClass: 'TIMEOUT'` at `TASK_DEADLINE_MS`, and the
      next queued task picks up normally afterward (queue isn't stuck)
- [ ] 🤖 **SSRF regression**: `isBlockedIp()` against the 18 known addresses (AWS/GCP
      metadata `169.254.169.254`, loopback, RFC1918 boundaries incl. `172.16.0.0`/
      `172.31.255.255`/`172.32.0.0`, CGNAT, public IPv4/IPv6, the IPv4-mapped-IPv6
      bypass case `::ffff:169.254.169.254`) — all must classify correctly
- [ ] 🖐️ Confirm the SSRF guard does NOT over-block: a real navigation to
      `boards.greenhouse.io` (or another legitimate ATS host) succeeds normally
- [ ] 🖐️ **`maxStalledCount: 0` regression**: `kill -9` the apply-bot process mid-task,
      restart it, confirm the interrupted task is NOT silently auto-reprocessed by
      BullMQ (should sit at `running` until the sweep — F2 — resolves it)

## F4 — Lever Adapter (Browser Automation)

**Corrected 2026-08-17**: no API shortcut exists for Lever (its apply endpoint also
needs an employer-owned API key) — this is browser automation, same test shape as
F5/F6, not an API-payload test.

- [ ] 🖐️ A real, currently-open `jobs.lever.co` posting's `applyUrl` resolves to
      `adapterUsed: 'lever'` via `resolveAdapter()`
- [ ] 🖐️ Against 3+ different real, currently-open Lever postings, shadow mode
      correctly fills name / email / resume upload — verify against the captured
      screenshots, not just the `fieldsFilled` JSON
- [ ] 🖐️ Resume file attaches correctly via the real DOM's file input
      (`input[name="resume"]` — confirm this selector against a live posting)
- [ ] 🖐️ Confirm Lever postings are guest-apply (no login) across the real postings
      tested — `login()` should be a correct no-op; flag if a gated board is found
- [ ] 🖐️ Login-page regression (same as F5): an expired/invalid stored session
      correctly triggers `failureClass: 'AUTH'` via `looksLikeLoginPage()`
- [ ] 🖐️ Record whether any tested Lever posting presents a CAPTCHA — not confirmed
      either way by research; this is the test that answers it
- [ ] 🖐️ (Live mode, only once trusted) a real application submits and a
      confirmation is verifiable on Lever's/the employer's side

## F5 — Greenhouse Adapter

- [ ] 🖐️ Against 3+ different real, currently-open Greenhouse postings, shadow mode
      correctly fills first name / last name / email / resume upload — verify
      against the captured `before-fill`/`after-fill` screenshots, not just the
      `fieldsFilled` JSON
- [ ] 🖐️ A posting with a required custom question outside the taxonomy is recorded
      as `unmapped` in `fieldsFilled`, never guessed at
- [ ] 🖐️ A posting protected by (possibly invisible) reCAPTCHA fails with
      `failureClass: 'CAPTCHA'` rather than silently mis-filling or crashing
- [ ] 🖐️ **Login-page regression**: point the adapter at an expired/invalid stored
      credential's session — confirm it fails with `failureClass: 'AUTH'` and the
      specific "landed on a login page" reason, not a confusing `LOW_CONFIDENCE`
- [ ] 🤖 A test fixture with only weak/ambiguous field signals produces
      `skipped_low_confidence`, not a low-confidence fill
- [ ] 🖐️ Resolve the React-hydration timing question (`docs/apply-bot/02` §4): does
      the classic board need a `waitForSelector` before fields exist? Record the
      answer and fix the adapter if needed

## F6 — Ashby Adapter

- [ ] 🖐️ Against 3+ different real, currently-open Ashby postings, shadow mode
      correctly fills the required fields — verify against screenshots
- [ ] 🖐️ A required custom question outside the taxonomy is recorded `unmapped`,
      never guessed
- [ ] 🖐️ Determine (previously unconfirmed by research) whether Ashby postings
      commonly present a CAPTCHA — record the finding, build detection/handling
      accordingly if so
- [ ] 🖐️ Login-page regression (same as F5-06) — confirm `AUTH` failure on a stale
      session rather than a confusing fill attempt
- [ ] 🤖 Low-confidence abstain regression (same as F5-05)
- [ ] 🖐️ Given Ashby's heavier React rendering, specifically verify field-scan
      timing — confirm `fieldTaxonomy.scanFields()` isn't running before the form
      has actually rendered

## F7 — CAPTCHA / Bot-Challenge Live-View

- [ ] 🖐️ A real CAPTCHA hit sets `ApplyTask.status` to the pause state with
      `pauseReason: 'captcha'`; the browser session stays open (not closed)
- [ ] 🖐️ The live-view WebSocket delivers frames at roughly 1-second cadence,
      matching Contract B's `{ type: 'frame', ... }` shape exactly
- [ ] 🖐️ Remote mouse/keyboard events sent from the frontend actually register in
      the real browser (e.g. click a checkbox via the live view, confirm it's
      checked in the actual page)
- [ ] 🖐️ After a human solves the CAPTCHA and signals resolution, the task resumes
      automatically and completes without further intervention
- [ ] 🤖 **Critical regression, flagged explicitly in the plan**: a task paused for
      a CAPTCHA is NOT killed by `TASK_DEADLINE_MS` (3 min) — confirm the deadline
      is paused/replaced while `status` is the pause state, using a test that holds
      a task paused past 3 minutes and verifies it's still alive
- [ ] 🖐️ An unsolved CAPTCHA times out at its own (longer, ~10 min) deadline and
      fails cleanly, closing the browser session
- [ ] 🖐️ An email-verification challenge is correctly detected and paused with
      `pauseReason: 'email_verification'`, with distinct on-screen instructions
      from the CAPTCHA case
- [ ] 🖐️ Confirm apply-bot has no public networking — the live-view WS is only
      reachable through the authenticated backend proxy; a direct connection
      attempt to apply-bot's own port from outside the private network fails

## F8 — Generic Engine (Non-ATS Sources)

- [ ] 🤖 **Gate regression**: with `APPLY_BOT_GENERIC_ENABLED=false`, confirm
      generic-platform jobs never get an `ApplyTask` created during selection
- [ ] 🖐️ Once enabled, a real non-ATS job's `applyUrl` gets scanned and its
      required fields matched with a reasonable confidence score
- [ ] 🖐️ A deliberately unusual/unmappable test form produces
      `skipped_low_confidence`, not a wrong guess
- [ ] 🤖 **SSRF regression, specifically for this feature**: confirm a generic-engine
      task attempting to navigate to a private/internal address is blocked by the
      SSRF guard — this is the scenario the guard was built ahead of time for

## F9 — Failure Measurement & Alerting

- [ ] 🖐️ Dashboard's `applyBotNeedsReview` count matches the actual number of
      `unknown_outcome` rows in the database
- [ ] 🖐️ `SchedulerAlert` shows the apply-bot staleness banner only after
      `apply-bot-select` has run at least once and then gone stale >25h — confirm
      NO false alarm for a user who's never enabled the feature
- [ ] 🖐️ `SchedulerAlert` shows the "needs review" banner when the
      `unknown_outcome` count is > 0, and it disappears once resolved
- [ ] 🖐️ Per-adapter success-rate query (`docs/apply-bot/03`) returns correct
      numbers against known seeded test data

## F10 — Testing & Verification Harness

- [x] 🤖 `npm test` exists and runs in under a minute — `node -r dotenv/config --test`
      (dotenv preload added 2026-08-19 so DB-dependent tests pick up `.env`
      automatically when present), both `backend/` and `backend/apply-bot/`,
      43 tests passing / 3 skipped (Playwright-only) as of 2026-08-19
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
- [ ] 🤖 **Blocked on a real Playwright install**: `fieldTaxonomy.bestMatch` against
      a fixture HTML page, `looksLikeLoginPage` against fixture pages

## F11 — Credential & Session Management UX

- [ ] 🖐️ A user can add a Greenhouse credential through the Settings UI with no API
      client/Postman needed
- [ ] 🖐️ The credential list never displays the secret after creation, only
      platform/status/`hasSessionState`
- [ ] 🖐️ Deleting a credential means subsequent selection correctly skips that
      platform (no credential → skip, per `applyBotSelect.js`)
- [ ] 🖐️ `ApplyBotLiveView.jsx` renders frames correctly against a stubbed WS server
      matching Contract B — buildable and testable independent of F7's real backend
- [ ] 🖐️ Mouse/keyboard capture in the live-view component correctly normalizes
      coordinates to the documented 0..1 range before sending

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

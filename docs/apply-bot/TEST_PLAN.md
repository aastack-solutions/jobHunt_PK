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

## Security Audit — 2026-08-21 (fixed on every F1-F12 branch)

Cross-cutting, not tied to one feature — see MEMORY.md's 2026-08-21 Decisions
Log entry for the full exploit chains and verification detail. Summarized here
so it isn't missed when reading feature-by-feature.

- [x] 🤖 **CRITICAL**: hostname-suffix spoofing in `applyBotPlatform.js` and
      each ATS adapter's `matches()` (`.includes()` instead of exact/suffix
      match) — a spoofed applyUrl like `boards.greenhouse.io.attacker.com`
      would route to the real adapter and exfiltrate a real stored credential.
      Fixed everywhere with exact-or-subdomain matching, plus a defense-in-
      depth host re-check in `greenhouseAdapter.login()` itself.
      `adapters.test.js`/`applyBotPlatform.test.js` cover the regression.
- [x] 🤖 **MEDIUM**: selector injection in `ashbyAdapter.js`/
      `genericAdapter.js`'s `locatorForField()` — unescaped `field.id`/
      `field.name` could redirect a fill to an unrelated element. Proved with
      a real headless Chromium page. Fixed with Node-safe attribute escaping.
- [x] 🤖 **MEDIUM**: CSV formula injection in `GET /api/applications/export` —
      a leading `=`/`+`/`-`/`@` in `notes`/`company`/`jobTitle` executes as a
      formula when the export is opened in a spreadsheet app. Fixed by
      defusing only values that actually start with a dangerous character.
      `applicationsCsvExport.test.js` (F1: `applications.test.js`) covers it.
- [x] 🤖 **LOW**: `auth.js` login timing side-channel (unknown-email logins
      skipped `bcrypt.compare` entirely) — fixed by always comparing against
      either the real hash or a fixed decoy hash of the same cost.
- [x] 🤖 **LOW**: `auth.js` no session regeneration on login/register — fixed
      with `req.session.regenerate()` before assigning `userId`.
- [x] 🤖 **LOW**: `jobFetcher.js`'s `normalizeJob()` didn't validate
      `applyUrl`'s scheme at all (confirmed a bare non-URL string was
      previously accepted) — fixed to reject anything that isn't `http(s)`.
      `auth.test.js` (self-skips without a reachable Redis/DB — see its own
      header comment) and `jobFetcherApplyUrlScheme.test.js` cover these.

Also corrected a misleading `schema.prisma` comment claiming
`ApplyTask.fieldsFilled` has real redaction logic — it doesn't; currently safe
only by construction, not by an actual filter.

---

## F1 — Data Model & Credential Encryption

**Verified 2026-08-18 against a real Neon Postgres instance — see MEMORY.md.**

**2026-08-20 follow-up (code review fix)**: the review's one F1 finding —
`ApplyTask.applicationId` had no DB-level FK or index despite being the documented
audit-trail lookup key — is fixed: added `@@index([applicationId])` and a proper
`application Application? @relation(..., onDelete: SetNull)`. Migration
`20260819185748_apply_task_application_fk` applied clean against the same live
Neon DB, verified end to end (created a real `Application` + `ApplyTask`, confirmed
the relation actually traces back). Also re-confirmed the credential round-trip and
the sessionState-clear fix directly via Prisma (not through the HTTP routes — Redis
still isn't available locally, so `PUT`/`GET`/`DELETE /api/apply-credentials` remain
unexercised end-to-end; only the underlying data-layer logic those routes call was
re-verified). Fixing this also surfaced and resolved real cross-branch **migration
drift**: the shared Neon DB had a migration (`pauseReason`, from F7) applied that
wasn't in this branch's history, and this branch's own first migration's file had
been regenerated with reordered-but-equivalent SQL, causing a checksum mismatch —
both reconciled without any data loss. Full story in `MEMORY.md`.

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

- [ ] 🖐️ `POST /api/internal/apply-bot/trigger-select` with the correct
      `X-Cron-Secret` → 200, creates `ApplyTask` rows respecting `APPLY_BOT_DAILY_CAP`
- [ ] 🤖 Same request with a wrong or missing secret header → 401
- [ ] 🖐️ Kill switch off (`apply_bot:enabled` = `false` in Redis) → response shows
      `enabled: false`, zero tasks created, but the sweep still ran (`swept` in the
      response is populated, not skipped)
- [ ] 🖐️ Run selection twice back-to-back with nothing having progressed — second
      run creates zero new tasks for jobs already `queued`/`running`/etc. (dedupe)
- [ ] 🖐️ A job at a company the user already has an `Application` for (within 90
      days) is skipped even if it's a different specific job posting
- [ ] 🖐️ `GET /api/internal/apply-bot/tasks/:id` with the correct
      `X-Apply-Bot-Secret` → 200, decrypted credential matches what was stored,
      task flips to `status: 'running'`
- [ ] 🖐️ Calling the claim endpoint twice for the same task doesn't error or corrupt
      state (idempotent re-claim)
- [ ] 🤖 **Idempotency regression**: `POST` a `submitted` callback for a task, then
      `POST` a `failed` callback for the *same, now-terminal* task — confirm the
      second call returns `alreadyTerminal: true` and does NOT change the task's
      status, and does NOT create a second `Application` row
- [ ] 🖐️ A `submitted` callback creates an `Application` with correct
      `source: 'auto_apply_bot'`, `resumeId`, and `applyUrl`, and backfills
      `ApplyTask.applicationId` to point at it
- [ ] 🖐️ Hammer `/api/jobs` (public) past its rate limit, then immediately hit
      `/api/internal/apply-bot/trigger-select` — confirm the internal call is NOT
      429'd by the public bucket (separate `internalLimiter`)

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

- [x] 🤖 `npm test` exists and runs in under a minute — `node --test`, both
      `backend/` and `backend/apply-bot/`, 37 tests passing as of 2026-08-17
- [x] 🤖 `cryptoService` round trip (incl. tampered-ciphertext and wrong-iv/authTag
      cases) — `backend/test/cryptoService.test.js`
- [x] 🤖 `applyBotPlatform.resolvePlatform`/`requiresCredential` against real
      fixture URLs — `backend/test/applyBotPlatform.test.js`
- [x] 🤖 `timingSafeEqualString` — same file as the crypto round trip
- [x] 🤖 The 18-case SSRF guard suite — `backend/apply-bot/test/ssrfGuard.test.js`
- [x] 🤖 `adapters/index.js`'s `resolveAdapter()` against real ATS URLs, plus a
      guard confirming every registered adapter is currently browser-based —
      `backend/apply-bot/test/adapters.test.js`
- [ ] 🤖 **Blocked on a live database**: the callback idempotency guard,
      `applyBotSweep`'s staleness thresholds
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

- [x] 🖐️ Migration applies cleanly (`source`, `resumeId` columns present) —
      confirmed live against the real Neon instance: `npx prisma migrate status`
      reports up to date, and `information_schema.columns` directly confirms
      `applyUrl`/`resumeId`/`source` all exist on `Application`
- [x] 🖐️🤖 Manual flow: clicking "Mark as Applied" in `CoverLetterModal` creates an
      `Application` with `source: 'manual'`, `applyUrl` populated from the job, and
      `resumeId` set to the currently-active resume — the API half is now verified
      for real via HTTP against a real Neon database (`test/applications.test.js`);
      the actual browser click itself is not yet exercised, only the endpoint it calls
- [ ] 🖐️ Bot flow: a `submitted` `ApplyTask` creates an `Application` with
      `source: 'auto_apply_bot'`, and `ApplyTask.applicationId` correctly points
      back at it — reviewed `internal.js`'s callback handler, correct; also found
      and fixed the same `task.mode` check gap present across F2/F7/F8/F10/F11
      (see the follow-up note below)
- [ ] 🖐️ Re-opening the modal for an already-tracked job shows the disabled
      "Applied" state, not an active "Mark as Applied" button
- [x] 🤖 An application with `status: 'applied'` and `appliedAt` 15 days in the past
      returns `isGhosted: true`; one from yesterday returns `false` — **found and
      fixed a real bug here, see the follow-up note below**
- [x] 🤖 `isGhosted` is `false` for `offer`/`rejected`/`withdrawn` regardless of age
- [ ] 🖐️ CSV export includes the `source` and `applyUrl` columns — reviewed
      `applications.js`'s CSV `Parser` field list, both present; not yet exercised
      by actually downloading and opening a real export
- [ ] 🖐️ Dashboard's `autoAppliedCount`/`ghostedCount` match the actual underlying
      data — reviewed `dashboard.js`, both correct by construction (the latter
      inherits the isGhosted fix below automatically since it calls the same
      shared function); not yet exercised against real seeded data end to end

**2026-08-21 follow-up (code review fix)**: found and fixed a real bug in
`applicationHealth.js`'s `isGhosted()` — it measured "days of silence" from
`updatedAt` for a still-`'applied'` row, but Prisma's `@updatedAt` is auto-managed
and always reflects the actual write time, ignoring any explicitly-passed value,
even on `create()`. Confirmed directly against the real database: creating an
application with `appliedAt` set 15 days in the past still got `updatedAt`
stamped as the current insert time — so `isGhosted()` always returned `false` for
a freshly-created row no matter how stale `appliedAt` was, directly contradicting
this feature's own definition (and the checklist item right above). Fixed: a
still-`'applied'` row now measures from `appliedAt` (days since it was actually
sent); a row that's progressed past `'applied'` at least once still measures from
`updatedAt` (the last real state change). This file had zero test coverage
before — added `test/applicationHealth.test.js`, 6 pure-function tests (no DB
needed, since `isGhosted()` never touches one), confirmed to fail on the old code
and pass on the fix. Also carried forward the established `task.mode === 'live'`
check onto `internal.js`'s Application-creation branch (same bug shape as F2's
fix, found present here too since this branch predates it).

**Also found, flagged, not fixed**: `applications.js`'s `POST /` has no
server-side guard against creating two `Application` rows for the same `jobId` —
the frontend's disabled-button state (`alreadyTracked`) is a real but
client-side-only guard, not airtight against two browser tabs or a network
retry. Not fixed here since the "right" policy (block a second application to
the same job forever, vs. allow re-applying to a reposted role later) is a
product decision, not something to assume.

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

**2026-08-21 (code review, before any of this was implemented)**: full bug-check
pass over F14's scaffold (`emailIntegration.js`, `emailStatusSync.js`, the
commented-out `EmailIntegration` model). Two real, provable bugs found and fixed
even though nothing here executes real logic yet — both would have surfaced the
moment someone followed the scaffold's own "uncomment + implement" instructions:

1. **Schema**: the commented-out `EmailIntegration` model declares `user User
   @relation(...)`, but `User` had no matching reverse-relation array field.
   Confirmed via `npx prisma validate` against a scratch copy with just the model
   uncommented — fails with "the relation field `user`... is missing an opposite
   relation field on the model `User`" (error code P1012). Fixed by adding the
   matching `emailIntegrations EmailIntegration[]` line to `User`, commented out
   in lockstep with the model, with a note to uncomment both together. Re-verified
   `prisma validate` passes once both sides are uncommented, and that the real
   (still-commented) schema still validates cleanly as-is.
2. **Route**: `GET /callback` had `requireAuth` on it, but this route is hit via a
   top-level cross-site redirect from `accounts.google.com`, and the project's
   session cookie is `sameSite: 'strict'` everywhere (`backend/CLAUDE.md`) —
   which withholds the cookie on exactly this kind of cross-site navigation.
   `requireAuth` would 401 on every real OAuth callback, breaking the feature
   outright the day it's implemented. Removed `requireAuth` from `/callback`
   only (`/connect` and `/disconnect` correctly keep it — both are same-site,
   user-initiated requests). Also corrected the accompanying design note: the
   original TODO said to put `req.session.userId` directly in the OAuth `state`
   param, which is attacker-tamperable and, without a session to cross-check it
   against on `/callback`, would let anyone edit `state` to a victim's userId and
   attach their own Gmail tokens to that victim's account. Rewrote the TODO to
   specify the standard fix: a random opaque `state` token minted in `/connect`,
   mapped to the userId in Redis with a short TTL, looked up and deleted
   (one-time use) in `/callback` instead of trusted from the client.

Neither fix required implementing real OAuth logic — `googleapis` still isn't a
dependency, the routes still return `501`, and the model is still commented out.
This only corrects two things that were already provably wrong in the scaffold
itself, so the first real implementation attempt doesn't inherit them.

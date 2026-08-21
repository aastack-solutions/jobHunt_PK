# MEMORY.md — Team Working Memory

This file is the shared, living memory for the JobHunt PK project — specifically the
auto-apply bot initiative, built by a 2-person team working in parallel. It is
**not** a spec (that's `docs/apply-bot/TECHNICAL_PLAN.md`) and **not** the
architectural plan (that's the plan referenced there) — it's the running log of
*what's actually true right now*: what's done, what's decided, what's open, who's
touching what.

## Update protocol (read this before editing)

- **Update this file whenever a feature's status changes** — started, blocked,
  done — not just at the end of a work session. The whole point is that the other
  team member can read this file and know the real state without asking.
- **Append to the Decisions Log, never rewrite it.** If a decision changes later,
  add a new dated entry explaining the change and why — don't delete the old one.
  History here is more valuable than tidiness.
- **Feature Status Table** rows should always match `TECHNICAL_PLAN.md`'s feature
  numbers (F1, F2, ...). If you add a feature there, add a row here.
- **Before starting work on a feature**, check this file for whether the other
  person already claimed it (see "Owner" column) — claim it here first to avoid
  duplicate work.
- **Open Questions**: strike through (`~~like this~~`) when resolved, with a
  one-line pointer to the Decisions Log entry that resolved it — don't delete, so
  the reasoning trail stays visible.

---

## Feature Status Table

(Mirrors `docs/apply-bot/TECHNICAL_PLAN.md`. Owner = who's actively working it,
"Unassigned" = up for grabs.)

| # | Feature | Status | Owner | Notes |
|---|---------|--------|-------|-------|
| F1 | Data model & credential encryption | ✅ Done, verified | Claude (session) | Verified 2026-08-18 against real Neon Postgres — all 7 test-plan items pass; one real bug found & fixed (sessionStateIv/authTag not cleared on credential update). 2026-08-21: also fixed F13's `isGhosted()` bug and carried forward the F2 mode-check fix onto `internal.js` — both live in this branch since F13's scope was absorbed into F1's, see F13's row and the Decisions Log. 2026-08-21: closed the previously-flagged missing duplicate-application guard on `POST /api/applications` — see Decisions Log |
| F2 | Backend orchestration API (claim/callback/select) | ✅ Built, ⚠️ untested | — | Timing-safe secret comparison, internal rate limiter, callback idempotency guard fixed 2026-08-17 |
| F3 | apply-bot service scaffold & worker runtime | ✅ Built, ⚠️ untested | — | `npm install` / Playwright browser install never run; SSRF guard, task deadline, graceful shutdown, retry-safe backendApi added 2026-08-17 |
| F4 | Lever adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | **Correction 2026-08-17**: no API shortcut exists (Lever's apply endpoint also needs an employer-owned key) — same posture as F5/F6, `leverAdapter.js` already built in Phase 1 |
| F5 | Greenhouse adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | Selectors are guesses; CAPTCHA is the expected common case, not an edge case; login-page detection now automatic |
| F6 | Ashby adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | Selectors are guesses; CAPTCHA presence unconfirmed by research; login-page detection now automatic |
| F7 | CAPTCHA / bot-challenge live-view | 🔴 Not started | Unassigned | Scope grew: must also cover email-verification challenges AND make TASK_DEADLINE_MS pause-aware (see Decisions Log 2026-08-17) |
| F8 | Generic engine (non-ATS sources) | 🔴 Not started, gated off | Unassigned | `APPLY_BOT_GENERIC_ENABLED=false` — don't enable until built |
| F9 | Failure measurement & alerting | 🟡 Partially built | Unassigned | Staleness/needs-review dashboard alerting done 2026-08-17; per-adapter success-rate reporting still open |
| F10 | Testing & verification harness | 🟡 Partially built | Unassigned | 37 automated tests passing (`npm test`, Node's built-in runner, zero new deps) covering everything browser-free/DB-free; remaining items blocked on a live DB or real Playwright install |
| F11 | Credential & session management UX | 🔴 Not started | Unassigned | API exists (`/api/apply-credentials`), no Settings-page UI |
| F12 | Live-mode rollout & safety ops | 🔴 Blocked on F5/F6/F9/F10 | Unassigned | Now also requires: scheduler actually wired, Railway grace period increased (see Decisions Log 2026-08-17) |
| F13 | Unified application tracking (source, resume link, ghosted) | ✅ Done, verified | Claude (session) | Closes the pre-existing "Apply button doesn't track" gap too — see Decisions Log 2026-08-17. 2026-08-21: code-review fix — `isGhosted()` had a real bug (measured from `updatedAt` instead of `appliedAt` for still-`'applied'` rows, so it never actually detected a freshly-ghosted application), fixed and tested for the first time (0 tests before). Migration confirmed applied cleanly against real Neon. Lives in F1's branch, not a separate F13 branch — see that entry's note |
| F14 | Email-based application status auto-detection | 🔵 Researched + specified, not built | Unassigned | User opted in to scoping this — needs a real Google Cloud OAuth app before any code can be tested |

Legend: ✅ done and verified · 🟡 built but unverified/needs work · 🔴 not started · ⚠️ flag worth reading before touching

---

## Decisions Log

### 2026-08-21 — F1/F13 code-review fix: isGhosted() bug, plus a self-caught wrong-branch mistake worth recording in full
Branch: `f1-data-model-credential-encryption`. This entry covers moving on to
"F13" after the earlier 12-branch pass (F1-F12, see entries below) — and a real
process mistake caught and corrected mid-task, which matters more than the bug
fix itself for anyone picking this file up later.

**The mistake**: F13 has no dedicated branch on `origin` (only F1-F11 do — F13
was built earlier, directly on `master`, back on 2026-08-17, before the
teammate's whole F1-F11 branch-based rebuild existed). Asked to "move to F13,"
the natural move was `git checkout -b f13-... master` — but the LOCAL `master`
branch in this clone had never been fast-forwarded to `origin/master` (only
`git fetch`ed, back when this session first discovered `origin/master` already
had F1-F11 merged — see that entry below). Local `master` turned out to be a
genuine ancestor of `origin/master` (confirmed via `git merge-base
--is-ancestor`), 15 commits behind — meaning it was the OLD, pre-rebuild
snapshot of the project (F4 still "Not started" in ITS OWN copy of this very
file, F7 too), not a diverged fork. Built an entire "F13" branch on top of that
stale base: reconciled a migration onto it, found and fixed a real bug in
`isGhosted()`, wrote a test file — all before checking whether any of it was
even necessary.

**The catch**: mid-way through, checked whether `origin/master` already had
F13's own files (`applicationHealth.js`, `dashboard.js`'s `ghostedCount`,
`CoverLetterModal.jsx`'s "Mark as Applied") — it did, all of them, byte-for-byte
present, because F13's scope had been absorbed into F1's branch from the start
(`schema.prisma`'s own file-manifest comment already said as much: "F1:
ApplyCredential, ApplyTask, Application.source/resumeId/applyUrl" — F13's
fields, credited to F1). The entire "F13" branch built on stale master was
redundant work sitting on the wrong foundation — none of its other 11 fixed
branches' work was reachable from it, and it would have needed to be reconciled
back in later anyway, the hard way.

**The correction**: stashed the orphaned branch's work (not deleted — a
mistake this session made itself is still worth keeping around rather than
force-deleting, in case anything in it turns out useful later), switched to
the REAL `f1-data-model-credential-encryption` branch (which already has this
session's earlier fix commit on it — see the 2026-08-20 entry below), and
re-applied the two genuinely valuable pieces there directly rather than trying
to port a diff across an unrelated base: the `isGhosted()` fix and its test
file. Confirmed F1's branch already has the correct migration (no gap there —
that "gap" only existed because the orphaned branch was missing a migration
file the real F1 branch has always had) and confirmed `internal.js`'s
`task.mode` check gap (F2's bug shape) is ALSO present here, unfixed, since F1
predates F2's fix — carried that forward too, same as every other
branch this session touched.

**What actually got fixed, now correctly on F1's branch**: `applicationHealth.js`'s
`isGhosted()` measured "days of silence" from `updatedAt` for a still-`'applied'`
row, but Prisma's `@updatedAt` always reflects the actual write time and ignores
any explicitly-passed value, even on `create()` — confirmed directly against
the real Neon database: an application created with `appliedAt` 15 days in the
past still got `updatedAt` stamped as the current insert time. `isGhosted()`
therefore always returned `false` for a fresh row regardless of how stale
`appliedAt` was, directly contradicting this feature's own
`TEST_PLAN.md` item. Fixed: a still-`'applied'` row now measures from
`appliedAt`; a row that's progressed past `'applied'` at least once still uses
`updatedAt`. This file had zero test coverage before — added
`test/applicationHealth.test.js`, 6 pure-function tests (no DB dependency,
since `isGhosted()` never touches one), confirmed to fail on the old code and
pass on the fix. Also carried forward the F2 `task.mode === 'live'` check onto
`internal.js`'s Application-creation branch here. Full backend suite re-run
clean: 50 tests, 43 pass, 7 skip, 0 fail.

**Also found, flagged, not fixed**: `applications.js`'s manual `POST /` has no
server-side guard against creating two `Application` rows for the same
`jobId` — the frontend's disabled-button state is real but client-side-only,
not airtight against two open tabs or a network retry. Not fixed: the "right"
policy (block re-applying to the same job forever vs. allow it for a reposted
role later) is a product decision, not something to assume unilaterally.

**Why this is worth a full entry, not just a quiet fix**: the mistake wasn't
catastrophic (nothing was pushed, nothing was lost, the orphaned branch is
still sitting there stashed) — but it's exactly the kind of error that
compounds silently if not caught: "F13" would have looked done, on a branch
that could never actually be merged into anything real without redoing the
same reconciliation later, under more time pressure, with less context. The
lesson for next time picking up a feature with no dedicated branch: check
whether `origin/master` already has it before assuming `master` (local OR
origin) is the right base at all.

### 2026-08-18 — F1 verified end-to-end against a real database; one real bug found and fixed
Working the F1-F14 ticket list one at a time (user's explicit workflow: one ticket per
branch, don't start the next until the current one's test-plan items are verified,
update this file hand-to-hand). Branch: `f1-data-model-credential-encryption`.

**Environment setup**: this dev machine had no local Postgres/Redis and no admin
rights to install them (winget PostgreSQL install hit a 403 from EnterpriseDB's CDN;
winget Memurai install hit an MSI `Error code 5 / Access Denied` on its custom
action's temp-dir creation, reproduced even with the tool sandbox disabled — a real
machine-level restriction, not a retryable fluke). User provided a Neon Postgres
connection string and an Upstash Redis (TCP/TLS, `rediss://`, not the REST API
variant — REST doesn't support BullMQ's blocking commands) for local dev instead.
Both wired into a new, gitignored `backend/.env`. **Note for whoever does F2/F3
next**: confirm the Upstash database's eviction policy is disabled — BullMQ needs
`noeviction`; not yet confirmed as of this entry.

**Migration history reconciliation**: `npx prisma migrate dev` against the fresh
Neon DB reported drift — the database already had a migration applied
(`20260818170025_apply_bot_and_tracking`, matching ApplyCredential/ApplyTask/
Application's new columns) that had no corresponding file in
`prisma/migrations/`. This confirms `docs/apply-bot/README.md`'s "Phase 1 is built
but not yet run" status was accurate only for the session that wrote it — this
exact schema was applied to this exact Neon instance at some point since. Rather
than `prisma migrate reset` (blocked by the auto-mode classifier as a destructive
DB op, correctly — even though this dev DB had zero rows, confirmed by row count
first), hand-wrote `prisma/migrations/20260818170025_apply_bot_and_tracking/migration.sql`
from `schema.prisma`'s model definitions, matching the naming/style conventions of
the two existing migrations. `prisma migrate deploy` afterward reported "No pending
migrations to apply" with no checksum errors — migration history and schema are now
reconciled and committed.

**Bug found and fixed**: `PUT /api/apply-credentials/:platform`'s update path only
cleared `sessionStateEncrypted`/`sessionStateSavedAt` on a re-login, leaving
`sessionStateIv`/`sessionStateAuthTag` as orphaned bytes from the old session — not
exploitable (nothing reads them while `sessionStateEncrypted` is null) but a real
deviation from the schema's own documented contract and the test plan's explicit
requirement. Fixed in `backend/src/routes/applyCredentials.js` to clear all three
fields together. Verified via a direct DB read (seeded dummy sessionState bytes,
PUT again, confirmed all three now null) — not just the API response.

**All 7 F1 test-plan items verified** (`docs/apply-bot/TEST_PLAN.md` checked off):
migration applies cleanly, PUT/GET/DELETE round-trip with no secrets ever in an API
response, encrypt→decrypt round trip returns the exact original object (confirmed
via a raw DB read — ciphertext bytes in the column, not plaintext), the
sessionState-clear bug above, and the 37 pre-existing automated tests (crypto
round-trip incl. tampered/wrong-iv cases, timing-safe comparison) still pass.
**Not re-attempted**: a full `migrate reset`-based fresh-instance replay (blocked by
the destructive-op classifier) — `migrate deploy`'s clean, error-free, checksum-
matching run against the reconciled history is treated as sufficient evidence for
this ticket; a human can run the full reset manually for extra confidence.
**Why**: this is what "ticket done, verified, not just written" means when the
verification tool itself correctly refuses to run a destructive command on your
behalf — real evidence from every angle that doesn't require it, not skipping the
check.

### 2026-08-17 — Auto-apply bot scope approved; Phase 1 built
Plan approved: fully autonomous auto-apply, CAPTCHA solved via human live-view as
the only review step, best-effort autofill on any destination, per-platform
pre-created credentials, hosting cost left open. Built as `backend/apply-bot/`, a
separate nested Railway service with no DB access of its own (talks to backend over
an authenticated internal API only). Schema gained `ApplyCredential`, `ApplyTask`,
`Application.applyUrl` — flagged as explicit deviations from the fixed-8-table rule
in `backend/prisma/CLAUDE.md`.
**Why**: user's explicit product decision, documented in the plan at
`C:\Users\Yasir\.claude\plans\all-the-things-is-federated-blossom.md`.

### 2026-08-17 — Adopted select ProBot/Nasiqa reference patterns, rejected the rest
Reviewed `autoappy.md` (an enterprise visa-automation platform's architecture).
Adopted: JPEG-screenshot-polling live view (simpler than CDP screencast), the
3-strategy CAPTCHA detection cascade + "already solved" check, Playwright
`storageState` session reuse, bounded per-selector micro-retry, lightweight failure
classification. Rejected as overkill for a 2-5 person tool: multi-region DB split,
SQS/ECS, warm bot pools, full orchestrator state machine, video recording.
**Why**: right-sizing — those patterns solve problems at an enterprise scale we
don't have; BullMQ+Redis+Postgres already covers what's needed here.

### 2026-08-17 — Research finding: Lever should use its official API, not browser automation
Confirmed via Lever's public `postings-api` docs: the apply endpoint is
**public and unauthenticated**, explicitly designed for external sites to embed a
job-listing + apply flow, and accepts resume upload via multipart form-data. This
is dramatically more reliable than DOM automation (no selector drift, no CAPTCHA
exposure documented, no login needed — Lever postings are guest-apply).
**Decision**: F4 (Lever adapter) should be rebuilt to call Lever's Postings API
directly via `axios`, not via `backend/apply-bot/src/adapters/leverAdapter.js`'s
current Playwright-based DOM approach. The existing `leverAdapter.js` should be kept
only as a fallback for any Lever-hosted posting that doesn't use the standard flow.
**Why**: this removes an entire category of risk (selector drift, bot-detection
exposure) for one of the three adapters, essentially for free — worth doing before
any further Lever work.

### 2026-08-17 (correction, same day) — Lever's apply endpoint ALSO requires an employer-owned API key — the above entry was wrong
Fetched Lever's actual `postings-api` README directly (the earlier research only
got a secondhand summary that conflated two different things). The real endpoint:
`POST /v0/postings/SITE/POSTING-ID?key=APIKEY` — and Lever's own docs state
plainly: **"An API key generated by a Super Admin from the integrations settings
page is required."** That's the employer's own Lever account credential, not
something an outside job-seeker's bot could obtain — the exact same dead end
already found for Greenhouse and Ashby. What's actually public/unauthenticated is
only the *read* side of the Postings API (listing jobs, fetching posting details) —
not the apply/submission endpoint. The earlier research summary said "the apply
endpoint is public" without having actually read the endpoint's own auth
requirement; this is what a direct fetch of the primary source caught.
**Decision, reversed**: F4 goes back to browser automation via
`leverAdapter.js` (already built in Phase 1), on equal footing with F5/F6 —
there is no API shortcut for any of the three known-ATS platforms. `TECHNICAL_PLAN.md`'s
F4 section, its Wave placement, and Contract A's rationale are being corrected to
match. Contract A (the `usesBrowser` branch in `worker.js`) currently has no real
consumer — left specified in case a genuinely public apply API turns up in a future
source (F8), not deleted, but not something to build ahead of an actual need either.
**Why**: caught before any code was written against the wrong premise — the value
of fetching the primary source directly instead of trusting a search-result summary,
on exactly the one point (auth requirement) that determined an entire feature's
architecture.

### 2026-08-17 — Research finding: Greenhouse and Ashby's official submit APIs are NOT usable by us
Greenhouse's application-submission endpoint requires the **employer's own** Job
Board API key (HTTP Basic Auth) — a secret only the hiring company holds, for their
own careers-page integration. Ashby's `applicationForm.submit` requires an API key
with `candidatesWrite` permission, same situation. Neither is obtainable by an
outside job-seeker's bot.
**Decision**: F5 (Greenhouse) and F6 (Ashby) stay on Playwright browser automation
— there's no legitimate API alternative. This is the correct, already-planned
approach; this entry just records that the "maybe there's an API" question was
checked and closed.
**Why**: avoids wasted effort chasing an API path that doesn't exist for our use
case, and confirms F7 (CAPTCHA live-view) is core-path work for these two adapters,
not a nice-to-have.

### 2026-08-17 — Research finding: CAPTCHA-solving services don't work reliably against Greenhouse, and we won't use them anyway
A real team that built something similar (`vanja.io/zapply-hacking-greenhouse-and-lever`)
reported Greenhouse uses **reCAPTCHA Enterprise**, and that both manual bypass
attempts and paid third-party CAPTCHA-solving services failed unpredictably against
it. They also hit an **email-verification challenge** (a 6-digit code sent to the
applicant's email) as a secondary bot-detection response — a failure mode not
previously accounted for in this project's design.
**Decision**: (1) Do not integrate any third-party CAPTCHA-solving service — evidence
says it doesn't work reliably here, and it's also the wrong approach (evading a
bot-detection system programmatically is a different, worse thing than a human
watching a live view and solving it themselves). (2) F7's scope now explicitly
includes a second pause type for email-verification challenges, not just CAPTCHA —
see `TECHNICAL_PLAN.md` F7 for the design. (3) Do NOT implement human-mimicry evasion
(randomized mouse movement, proxy rotation) — same reasoning as (1), and the
real-world evidence says it didn't even work for the team that tried it.
**Why**: real-world validation beats guessing; this also draws a clear ethical line
this project should not cross (automate the mechanical work, let a human handle
actual identity/anti-bot challenges).

### 2026-08-17 — Playwright version pin is stale
Research shows current stable Playwright is ~1.62.1 (this project's
`backend/apply-bot/package.json` pins 1.49.1, chosen without verification at
scaffold time). Confirmed Node 22.x is still supported by current Playwright
releases.
**Decision**: bump the pin before F5/F6 work begins — see `TECHNICAL_PLAN.md` F5/F6
for details. Not yet done as of this entry.
**Why**: avoids building/testing against an outdated Playwright version when a
newer one is trivially available and still Node-22-compatible.

### 2026-08-17 — Security pass: 4 findings fixed, 3 documented as already-handled or deferred
Full write-up in `docs/apply-bot/TECHNICAL_PLAN.md`'s "Security Findings & Fixes"
section. Summary:
- **Fixed — SSRF via `applyUrl`**: confirmed research shows npm SSRF-filter packages
  (ssrf-req-filter, request-filtering-agent) don't protect Playwright's `page.goto()`
  at all (they wrap Node's http.Agent, which the browser doesn't use). Built
  `backend/apply-bot/src/engine/ssrfGuard.js` — a `context.route()`-based guard that
  blocks navigation/requests to private/loopback/link-local/metadata addresses,
  wired into every browser session. Unit-tested against 18 known addresses
  (including the IPv4-mapped-IPv6 bypass pattern seen in real CVEs) — all passed.
- **Fixed — timing side-channel** on the `X-Cron-Secret`/`X-Apply-Bot-Secret`
  comparison in `internal.js` (was a plain `!==`). Added
  `cryptoService.timingSafeEqualString()`.
- **Fixed — no ceiling on total task duration**: added a 3-minute
  `TASK_DEADLINE_MS` in `apply-bot/src/worker.js` so a hung page can't stall the
  concurrency:1 queue forever.
- **Fixed — internal traffic shared a rate-limit bucket with public traffic**: split
  `/api/internal/*` onto its own `internalLimiter` (300/min) so a burst of public API
  usage can't 429 the apply-bot service's own calls.
- **Documented, not code-fixed**: master-key rotation (already an open item in
  `docs/apply-bot/05`), the DNS-rebinding residual risk on the new SSRF guard
  (documented in the guard's own comments, not fully closable from application
  code), and confirmed (not fixed — was already correct) that password-like fields
  can never end up in the `fieldsFilled` audit trail by construction.
**Why**: the user asked for a dedicated vulnerability pass on the plan before
Track A/B work begins — better to close what's closable now than find it mid-adapter
-build.

### 2026-08-17 — Reliability pass: 6 findings, 5 fixed, 1 specified precisely for F7
Full write-up in `docs/apply-bot/TECHNICAL_PLAN.md`'s "Reliability Hardening"
section. The question asked was "assuming nothing is attacking us, what makes this
fail more than it should, or fail in a *worse* way than just failing cleanly?" —
not "make it never fail" (browser automation against third-party sites always will,
sometimes), but "make the common case succeed and the failure case resolve into a
clear, safe, actionable state." Summary:
- **Fixed** — a crashed apply-bot process left tasks stuck `running` forever,
  silently blocking that job from ever being retried; naively marking it `failed`
  would have risked a genuine duplicate application. New `unknown_outcome` status
  (`backend/jobs/applyBotSweep.js`), excluded from auto-retry indefinitely, surfaced
  on the dashboard, resolved only by a human.
- **Fixed** — no graceful shutdown; a Railway redeploy could kill a task mid-fill
  with no result ever reported. `apply-bot/src/server.js` now handles SIGTERM via
  `worker.close()`. **Still needs a Railway config change** (increase the
  SIGTERM→SIGKILL grace period) — not something I could set from code.
- **Fixed** — BullMQ's default stalled-job auto-retry would have reintroduced the
  same duplicate-application risk as the first finding, through a different
  mechanism. `maxStalledCount: 0` explicitly disables it.
- **Fixed** — no visibility if the apply-bot pipeline goes quiet or tasks pile up
  needing review. Extended the existing `SchedulerAlert.jsx`/dashboard pattern
  (already built for `daily-job-fetch`) to cover apply-bot too, rather than
  inventing a new mechanism.
- **Fixed** — adapters had no way to notice a reused session had expired and
  silently landed them on a login page. New generic `looksLikeLoginPage()` heuristic
  (password field + no file-upload field), wired into `worker.js` automatically —
  F5/F6 don't need to do anything extra to benefit from it.
- **Fixed** — `backendApi.js` had no retry for transient network blips between the
  two Railway services, AND the callback endpoint had no idempotency guard — fixing
  the first without the second would have let a retried `submitted` callback create
  a duplicate `Application` row. Both landed together on purpose.
- **Specified, not built** — `worker.js`'s `TASK_DEADLINE_MS` (3 min) will kill a
  legitimately-paused CAPTCHA task the instant F7 introduces the pause state, unless
  F7 explicitly makes the deadline pause-aware. Documented precisely in F7's own
  plan section so this isn't rediscovered as a production bug.
**Why**: the user asked that finishing the technical plan mean the system is
actually done, not "features built, fixes discovered later" — this pass exists to
close that gap before Track A/B work starts, not after.

### 2026-08-17 — "Track all applications": F13 built, F14 researched + specified
Research validated the existing design (Simplify's ATS-autofill tool explicitly
"logs every submission to the tracker automatically" — same pattern as `internal.js`
already does) and surfaced real gaps: `Application` had no `source` field, no
resume-version link, and — predating this whole session — the Jobs-page "Apply"
button never actually created an `Application` record at all (flagged in `JOBHUNT.md`
before the auto-apply bot work started). Built F13 to close all three together,
plus a shared "ghosted" detection utility per common job-tracker convention (14
days no response / 10 days stalled).
**Decision on Tier 2** (email-based status auto-detection): user explicitly chose to
scope it in despite it being the most privacy-sensitive integration in the project
so far. Researched the real mechanism (Gmail OAuth + AI classification, same pattern
Huntr/Simplify/Teal-adjacent tools use) and a critical, non-obvious cost finding:
Gmail's read scopes are Google "restricted" scopes requiring an annual CASA security
audit ($500-$4,500/yr) for apps in production — but apps kept in Google Cloud
Console's "Testing" status with named test users are exempt, and this project's
real scale (2-5 users) fits that exemption cleanly. Specified as F14 in the plan,
**not built** — needs a real Google Cloud OAuth app registered first (a console
step, not a code step) and is significant enough scope to deserve its own
implementation pass rather than being rushed in alongside F13.
**Why**: the user asked specifically for research before committing to Tier 2 given
its privacy footprint — the CASA finding is exactly the kind of thing that needed
surfacing before anyone started building against an assumption it'd be simple.

### 2026-08-17 — Starting F4: caught and corrected a wrong premise before writing any code against it
Before touching `leverAdapter.js`, fetched Lever's actual `postings-api` README
directly (rather than trusting the earlier secondhand search-result summary) to
confirm the exact request schema before implementing. That fetch is what surfaced
the API-key requirement — see the correction entry above. Also attempted to
directly fetch two real, currently-open Lever postings to inspect their live DOM as
a substitute for a real Playwright session (which isn't available in this dev
environment — no `npm install` has run for `apply-bot/`); both returned **HTTP 403**
— Lever blocks non-browser HTTP requests at the network layer. Recorded as a real
finding (documented in `leverAdapter.js`'s file comment): DOM verification for this
adapter genuinely requires a real Playwright browser session, not a workaround.
**What was actually built this session**: corroborated `leverAdapter.js`'s existing
selector guesses against Lever's real API field names (`name`/`email`/`resume`
match exactly — a genuine confidence signal, not proof); flagged `comments` as a
real, documented free-text field with no adapter currently using it (a plausible
future cover-letter integration, explicitly out of scope for now); and — the most
concrete progress — stood up a **permanent automated test suite**: `node --test`
(Node's built-in runner, zero new dependencies) wired into both `backend/` and
`backend/apply-bot/`, 37 tests passing, covering everything from this session that
doesn't need a live database or a real browser (crypto round-trip incl. the
wrong-iv/authTag bug class, platform/adapter URL resolution against real ATS URLs,
the full 18-case SSRF guard suite, timing-safe comparison).
**Why**: the user asked for the plan to be "finalized" with test cases before
implementation starts, then explicitly said to begin F4 once that was done — this
is what beginning F4 honestly looks like in an environment without a live browser
or database: real verification where possible, clearly flagged manual work where
not, and no pretending either constraint doesn't exist.

### 2026-08-17 — Locked the file structure: no new files outside the documented set
Added a "File Structure" section to the top of `TECHNICAL_PLAN.md` — a complete
tree of every file this initiative touches, marked built vs. planned (planned
entries are named/scoped already, by the feature that will create them). Rule going
forward: implement inside these files; a task that seems to need an undocumented
new file means updating that section first, not creating one silently.
**Why**: the user asked for this explicitly, after the plan had grown large enough
across F1-F14 that an implementer could otherwise lose track of what's supposed to
exist versus what's an unplanned addition.

### 2026-08-17 — Scaffolded every planned file from the manifest
User asked for the full professional file/folder structure to be actually created,
not just documented, so the team can fill in files rather than design them from
scratch. Created all 11 previously-"planned" files (each with correct exports,
contract-matching function signatures, and `// TODO(F#)` markers at exactly the
points needing real logic — not empty files) plus extended 4 existing files
(`schema.prisma`'s commented-out `EmailIntegration` model, `adapters/index.js`
registering `genericAdapter`, `worker.js`'s paused-session registry stub,
`captchaDetector.js`'s `detectEmailVerification` stub, `Settings.jsx`'s credential
section shell). Nothing newly created is wired into the running app (not mounted in
`app.js`, not enabled by env vars) — everything exists as correct, inert scaffolding.
Two real decisions made while doing this, both reflected in the manifest: F7's
apply-bot-side WS handling got its own file (`liveView.js`) rather than being
crammed into `server.js`, and F9's reporting script got a concrete name
(`applyBotFailureReport.js`) it didn't have before.
**Caught and fixed one real bug while building this**: `genericAdapter.js` being
registered in `adapters/index.js` (even though it's inert until F8's
`APPLY_BOT_GENERIC_ENABLED` flag is on) changed `resolveAdapter()`'s return value
for non-ATS URLs from `null` to the generic adapter — which broke an existing,
passing F10 test. Fixed by tightening `genericAdapter.matches()` to still reject
genuinely malformed URLs (not blindly match anything) and updating the one test
whose expected behavior legitimately changed. Also caught: two new Playwright-
dependent test stubs (`fieldTaxonomy.test.js`, `captchaDetector.test.js`) had a
top-level `require('playwright')` that would have thrown at test-discovery time
even though the tests themselves are marked skipped — Node's `skip` option only
skips the test body, not module-level requires. Fixed by moving those requires
inside each test function. Full suite re-verified after both fixes: 37 passing, 7
correctly skipped (Playwright/live-DB-dependent), 0 failing.
**Why**: the user wants to start implementation immediately after this — better to
have caught these two bugs now than have them surface as confusing failures the
first time someone actually fills in a TODO.

### 2026-08-20 — F1 review fix: applicationId FK/index, plus real cross-branch migration drift discovered and reconciled
Started fixing the one F1 finding from the 11-branch code review (`ApplyTask.applicationId`
had no DB-level FK or index despite being documented as the audit-trail lookup key).
Added `@@index([applicationId])` and a proper `Application?` relation
(`onDelete: SetNull` — an Application being deleted shouldn't delete the bot's own
audit trail, the link should just go stale). Running the migration against the
shared Neon DB surfaced a real problem, not a hypothetical one:
- **Cross-branch migration drift**: the DB already had a migration applied
  (`pauseReason` on `ApplyTask`) that didn't exist in this branch's migration
  history at all — traced it to F7's branch (confirmed via `git ls-tree` across all
  11 branches; it also propagated to F8-F11 since they stack on F7). Root cause:
  multiple branches sharing one physical Neon database, each independently running
  `prisma migrate dev` against it. Fixed by copying F7's exact migration file into
  this branch (byte-identical, verified via checksum) and bringing the
  corresponding `pauseReason`/schema changes into this branch's `schema.prisma` too.
- **A second, separate drift symptom**: this branch's own first migration
  (`20260818170025_apply_bot_and_tracking`) had two `CREATE INDEX` statements in a
  different order than what was actually applied to the DB — semantically
  identical, but the checksum mismatch still blocked Prisma. Confirmed via SHA-256:
  my original (from this session's earlier work, still recoverable from a local git
  stash) matched the DB's recorded checksum exactly; the branch's committed version
  didn't. Fixed by restoring the byte-identical original.
- **Did NOT run `prisma migrate reset`** despite Prisma suggesting it — checked
  first and the shared DB had real data (2,808 jobs, 10 `ApplyTask` rows, 1
  `ApplyCredential`, 1 real user from the teammate's own F1 verification). Asked the
  user how to proceed rather than assuming; they chose reconcile-without-data-loss.
  All of that data is confirmed intact after the fix.
**Verification performed**: migration applied clean; Prisma client regenerated;
credential encrypt→decrypt round trip and the sessionState-clear fix re-confirmed
directly via Prisma (mirroring `applyCredentials.js`'s exact logic); the new
`applicationId` relation confirmed working end-to-end (created a real Application +
ApplyTask, traced the relation back). All done against a throwaway test user,
cleaned up after.
**Also worth recording honestly**: my first verification attempt crashed
(`APPLY_BOT_MASTER_KEY` was never actually added to the real `.env` — only
`.env.example` had ever been updated) *after* creating its throwaway test user but
*before* reaching its own cleanup step, leaving an orphaned row in the shared DB —
the exact same class of bug the F2 review flagged in `applyTaskCallback.test.js`'s
`seedTask()` (fixture creation outside try/finally). Caught it by checking user
count before/after rather than assuming cleanup worked, and deleted the orphan.
Generated and added the missing `APPLY_BOT_MASTER_KEY` (and the rest of the
`APPLY_BOT_*` vars, which had also never been copied from `.env.example` into the
real `.env`) as part of this fix.
**Why**: the user asked to fix and verify F1 specifically — this is what "verify"
actually required once a real shared database was involved, not just applying the
one intended schema change in isolation.

### 2026-08-21 — F1: closed the flagged duplicate-application guard

The 2026-08-21 F1/F13 review (above) flagged but deliberately did not fix a gap:
`applications.js`'s `POST /` had no server-side check against creating two
`Application` rows for the same `jobId` — the frontend's disabled "Applied" button
(`CoverLetterModal.jsx`'s `alreadyTracked`) is real but client-side only, not
airtight against two open tabs, a rapid double-click racing the button's own
disable, or a network retry. Left open at the time as a product-policy question
(should re-applying to the same job *ever* be allowed again, e.g. a reposted role)
rather than something to assume. The user has now explicitly asked for it to be
fixed, which resolves that open question in favor of closing the accidental-
duplicate case without deciding the "forever" policy question.

**Fix**: inside `POST /`'s `if (jobId)` block, after loading the job, added
`prisma.application.findFirst({ where: { userId, jobId } })` — if a row already
exists, return it with `200` instead of creating a second one. Idempotent-return
pattern (same philosophy as `internal.js`'s existing `TERMINAL_STATUSES` guard):
a duplicate click is a harmless no-op from the caller's perspective, not an error.
Scoped to `jobId` only — `jobId`-less manual entries (freehand job title/company)
have no natural identity to dedupe on and are meant to allow several distinct rows,
so they're untouched. Deliberately **not** a DB-level unique constraint — that
would decide the "can you ever re-apply to this job" policy question unilaterally,
which is still open.

**Tests**: new `backend/test/applications.test.js`, mounting the real
`applications.js` router on a throwaway HTTP server with a minimal fake-session
middleware (`req.session = { userId }`), same pattern as
`applyTaskCallback.test.js`. Two cases, both run against real Neon: (1) POSTing
the same `jobId` twice → first is `201`, second is `200` with the *same* id, and
exactly one row exists in the DB afterward; (2) POSTing without a `jobId` twice →
both `201` with different ids (manual entries are never deduped). Confirmed test
(1) actually catches the original bug by reverting the guard and re-running —
got `201 !== 200` as expected, then restored the fix and reconfirmed both pass.
Full backend suite re-run clean afterward: 52 tests, 45 pass, 7 skip, 0 fail.

**Why**: the user explicitly asked for this specific flagged gap to be closed,
rather than leaving it open indefinitely as a "someday" item — and the idempotent-
return approach lets the fix land without also silently making the harder, still-
unmade "can you ever re-apply" product decision.

---

## Open Questions

- Whether to add `phone`/`linkedinUrl`/`portfolioUrl` fields to `User` (schema
  change, needs explicit sign-off) vs. accepting that ATS forms requiring phone will
  always abstain. See `docs/apply-bot/01-research-plan.md` §D. **Unresolved.**
- Hosting choice for `apply-bot` (Railway in-container vs. Browserbase/Browserless
  vs. VPS) — left open in the original plan pending real volume data. Browserbase
  pricing researched 2026-08-17 (Developer tier $20/mo, 25 concurrent browsers, 100
  browser-hours, includes stealth mode + auto CAPTCHA solving — though note the
  CAPTCHA-solving-doesn't-reliably-work-on-Greenhouse finding above may apply to
  Browserbase's auto-solve too; would need direct testing, not assumed). **Unresolved
  — revisit once F5/F6 have real failure-rate data (see F9).**
- Whether Ashby application forms present CAPTCHAs in practice — not confirmed by
  research. **Unresolved — first real F6 test run will answer this.**

---

## How This File Relates to the Other Docs

- `docs/apply-bot/TECHNICAL_PLAN.md` — the feature-numbered technical spec, updated
  when scope changes (not for routine status updates — that's this file).
- `docs/apply-bot/01` through `05` — deep-dive research/issues/metrics/tuning/ops
  docs, referenced from the plan, not duplicated here.
- This file — the fast-moving "what's true right now" layer both of you should read
  first each time you sit down to work on this feature.

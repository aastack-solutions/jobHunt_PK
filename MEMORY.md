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
| F1 | Data model & credential encryption | ✅ Done, verified | Claude (session) | Verified 2026-08-18 against real Neon Postgres — all 7 test-plan items pass; one real bug found & fixed (sessionStateIv/authTag not cleared on credential update) |
| F2 | Backend orchestration API (claim/callback/select) | ✅ Done, verified | Claude (session) | Verified 2026-08-19 against real Neon+Upstash — all 10 test-plan items pass; found & fixed a real bug (bullConnection.js dropped TLS for rediss:// — hung every BullMQ queue, not just this one) |
| F3 | apply-bot service scaffold & worker runtime | ✅ Built, ⚠️ untested | — | `npm install` / Playwright browser install never run; SSRF guard, task deadline, graceful shutdown, retry-safe backendApi added 2026-08-17 |
| F4 | Lever adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | **Correction 2026-08-17**: no API shortcut exists (Lever's apply endpoint also needs an employer-owned key) — same posture as F5/F6, `leverAdapter.js` already built in Phase 1 |
| F5 | Greenhouse adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | Selectors are guesses; CAPTCHA is the expected common case, not an edge case; login-page detection now automatic |
| F6 | Ashby adapter — browser automation + selector verification | 🟡 Built, unverified | Unassigned | Selectors are guesses; CAPTCHA presence unconfirmed by research; login-page detection now automatic |
| F7 | CAPTCHA / bot-challenge live-view | 🔴 Not started | Unassigned | Scope grew: must also cover email-verification challenges AND make TASK_DEADLINE_MS pause-aware (see Decisions Log 2026-08-17) |
| F8 | Generic engine (non-ATS sources) | 🔴 Not started, gated off | Unassigned | `APPLY_BOT_GENERIC_ENABLED=false` — don't enable until built |
| F9 | Failure measurement & alerting | 🟡 Partially built | Unassigned | Staleness/needs-review dashboard alerting done 2026-08-17; per-adapter success-rate reporting still open |
| F10 | Testing & verification harness | 🟡 Partially built | Unassigned | 43 automated tests passing, 3 skipped (Playwright-only) as of 2026-08-19 — DB-dependent sweep/callback tests un-skipped and made real during F2 verification; remaining items need a real Playwright install |
| F11 | Credential & session management UX | 🔴 Not started | Unassigned | API exists (`/api/apply-credentials`), no Settings-page UI |
| F12 | Live-mode rollout & safety ops | 🔴 Blocked on F5/F6/F9/F10 | Unassigned | Now also requires: scheduler actually wired, Railway grace period increased (see Decisions Log 2026-08-17) |
| F13 | Unified application tracking (source, resume link, ghosted) | ✅ Built, ⚠️ untested | — | Closes the pre-existing "Apply button doesn't track" gap too — see Decisions Log 2026-08-17 |
| F14 | Email-based application status auto-detection | 🔵 Researched + specified, not built | Unassigned | User opted in to scoping this — needs a real Google Cloud OAuth app before any code can be tested |

Legend: ✅ done and verified · 🟡 built but unverified/needs work · 🔴 not started · ⚠️ flag worth reading before touching

---

## Decisions Log

### 2026-08-19 — F2 verified end-to-end; found and fixed a bug affecting every BullMQ queue, not just apply-bot
Branch: `f2-backend-orchestration-api` (branched from `master` *after* merging F1 in,
so each ticket branch stacks cleanly rather than losing the previous ticket's work —
correcting a mistake made when this branch was first cut off pre-F1 `master`).

**Bug found and fixed — `backend/src/queues/bullConnection.js` dropped TLS for
`rediss://` URLs.** The function hand-builds an ioredis connection object from
`REDIS_URL` (host/port/username/password) but never inspected `url.protocol`, so a
`rediss://` URL (Upstash, and any other TLS-only managed Redis) silently connected
over plain TCP instead — which doesn't error, it just hangs the TCP handshake
forever. Confirmed directly: `applyBotQueue.add()` hung indefinitely before the fix,
completed instantly after adding `tls: u.protocol === 'rediss:' ? {} : undefined`.
**This isn't apply-bot-specific** — `aiQueue.js` and `schedulerQueue.js` share the
same `bullConnection()` helper, so this was silently breaking the AI-generation
queue and the scheduler's repeatable jobs too, on any TLS-Redis deployment. Confirmed
node-redis (`src/redis.js`, used for sessions/kill-switch) was unaffected — it
receives the URL string directly and parses the scheme itself, so only the
hand-rolled BullMQ path had the bug.

**All 10 F2 test-plan items verified** against real Neon Postgres + Upstash Redis
(`docs/apply-bot/TEST_PLAN.md` checked off): trigger-select auth (missing/wrong
secret → 401), daily-cap enforcement (seeded 2 eligible jobs, capped at 1, confirmed
exactly 1 task created), kill-switch-off behavior (sweep still runs, zero tasks),
run-twice dedupe (0 new tasks second time), company-level dedupe (a job at a company
with an existing `Application` is skipped even as a never-seen posting), the claim
endpoint (decrypted credential matches what F1 stored, status flips to `running`,
idempotent re-claim), and the callback path (submitted → `Application` created with
correct `source`/`resumeId`/`applyUrl`, `ApplyTask.applicationId` backfilled;
duplicate/stale callback on a terminal task → `alreadyTerminal: true`, no double
`Application`, no downgrade). Also verified `internalLimiter` isolation directly:
hammered `/api/jobs` past its 100/min public limit (confirmed via 10 real 429s),
`trigger-select` still returned 200 immediately after.

**Turned manual verification into permanent tests**: `backend/test/applyBotSweep.test.js`
and `backend/test/applyTaskCallback.test.js` were placeholder `assert.ok(true)`
stubs skipped for lack of a DB (per F10's original scope). Both un-skipped and
actually implemented — real fixture rows via Prisma, real HTTP calls to a running
backend, self-skipping gracefully (not failing) when `DATABASE_URL` or a reachable
backend isn't present, so `npm test` still passes clean in a DB-less checkout.
`package.json`'s `test` script now preloads `dotenv/config` so these pick up a local
`.env` automatically. Full suite: 43 passing, 3 skipped (Playwright-only), 0 failing.
**Why**: same standard as F1 — a ticket is "done" when there's real evidence from
every angle that doesn't need a destructive op, not just a written implementation.
Fixing the TLS bug here rather than deferring it to F3 (where it would have looked
like a Playwright/worker problem, not a queue-connection one) saves real debugging
time later — it would have manifested identically inside the apply-bot worker.

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

### 2026-08-20 — F2 review fixes (autonomous continuation): mode-check gap, unguarded test DB writes, fixture leak
Continuing the F1-F14 fix cycle per the user's explicit workflow, in an autonomous
loop tick — F1 was done and left awaiting the user's go-ahead on commit/push (an
irreversible action, correctly not acted on autonomously); F2's fixes are all local,
reversible work, so continued per "act on established work, wait on irreversible
steps." Branch: `f2-backend-orchestration-api`.

**Fixed the critical finding**: `internal.js`'s callback handler created a real
`Application` for any `status:'submitted'`, never actually checking `task.mode`
despite its own comment claiming "live mode only." Gated on `task.mode === 'live'`;
a shadow-mode task hitting this path now logs a warning instead of silently
creating a fake Application. Added a new permanent test for exactly this case.

**Fixed the DB-safety gap**: `npm test` preloaded the real `.env` unconditionally
(`node -r dotenv/config --test`), so both DB-integration test files ran against
whatever `DATABASE_URL` was configured with zero guard — a normal dev setup was
enough to make `npm test` silently write/delete real rows. Both files now require
an explicit `RUN_DB_TESTS=true` opt-in; `npm test` alone stays safe-by-default.

**Fixed the fixture-leak bug**: `applyTaskCallback.test.js`'s `seedTask()` was
called outside its `try` block, so a partial failure (User created, Job creation
then throws) would leave the User row permanently orphaned. Restructured to a
mutable fixture object populated incrementally, so `cleanup()` can act on whatever
was actually created, not just a full success.

**Verified for real**: ran with `RUN_DB_TESTS=true` — `applyBotSweep.test.js`'s two
tests executed against the live Neon DB and passed (a real stale `running` task was
actually swept to `unknown_outcome`, confirmed via a fresh DB read; a fresh task was
confirmed untouched). **Could not verify**: `applyTaskCallback.test.js`'s HTTP-based
idempotency tests (including the new shadow-mode-doesn't-create-Application test) —
these need a running backend, which needs Redis for sessions, and this environment
has none available (confirmed no local service, no admin rights to install one —
same constraint noted in the original 2026-08-19 F2 verification entry, except that
session apparently had Upstash Redis configured and this one doesn't). Correctly
skips with a clear reason. **Flagging for whoever has Redis available next**: run
`applyTaskCallback.test.js` for real once possible — it's the one place the
`task.mode` fix from this entry is actually exercised end-to-end through the real
route, not just reviewed by inspection.
**Why**: the original 2026-08-19 F2 verification pass (a separate session, likely
your teammate's own Claude Code instance — see the F1 entry above on why) had
working Redis and marked all F2 test-plan items done, but still missed the
`task.mode` gap — a good concrete example of why the code review's "verification
doesn't always mean verification" pattern was worth taking seriously rather than
just fixing individual bugs and moving on.

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

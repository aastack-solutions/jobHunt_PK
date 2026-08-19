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
| F3 | apply-bot service scaffold & worker runtime | ✅ Done, verified (2 items env-blocked) | Claude (session) | Verified 2026-08-19 locally (no Docker) — full worker pipeline, TIMEOUT deadline, maxStalledCount:0 all confirmed live; docker build (no Docker) and real SIGTERM delivery (Windows limitation) need the actual Railway deploy |
| F4 | Lever adapter — browser automation + selector verification | ✅ Done, verified | Claude (session) | Verified 2026-08-19 against 5 real live postings — name/email/resume selectors confirmed correct, CAPTCHA (hCaptcha) confirmed present on all 5 (resolves prior open question), 2 real bugs found & fixed (locateSubmit selector, isAlreadySolved textarea-vs-input check) |
| F5 | Greenhouse adapter — browser automation + selector verification | ✅ Done, verified | Claude (session) | Verified 2026-08-19 against 5 real live postings on the new job-boards.greenhouse.io domain — selectors correct as-is (no code bug found), CAPTCHA confirmed present on all 5 (1 only post-fill, confirming the dual pre/post check matters), hydration-timing question resolved (no wait needed) |
| F6 | Ashby adapter — browser automation + selector verification | ✅ Done, verified | Claude (session) | Verified 2026-08-19 against 5 real live postings — 2 real bugs found & fixed (a genuine field-scan hydration-timing race, unlike F5's Greenhouse where none was needed; and a click-through-to-/application form flow); CAPTCHA not observed on any of the 5 (unlike F4/F5's 100%) |
| F7 | CAPTCHA / bot-challenge live-view | ✅ Done, verified (2 items narrower-scope) | Claude (session) | Verified 2026-08-19 against a real hCaptcha — full pause→live-view→resume cycle confirmed live, critical TASK_DEADLINE_MS pause-aware regression confirmed with real evidence, 1 real bug fixed (WS auth accepted-then-closed instead of never-accepted). Mouse/keyboard round-trip and email-verification not exercised against real occurrences — see TEST_PLAN.md |
| F8 | Generic engine (non-ATS sources) | ✅ Done, verified | Claude (session) | F8a + F8b built and verified against real postings; `genericAdapter.js` implemented. F8c researched and deliberately closed — 3/16 aggregator postings reachable, and 2 of those 3 land on adapters we already have. `APPLY_BOT_GENERIC_ENABLED` stays false as a *conclusion*, not a gap |
| F9 | Failure measurement & alerting | ✅ Done, verified | Claude (session) | Verified 2026-08-19 against real Neon — all 4 test-plan items pass. Remaining half built (`jobs/applyBotFailureReport.js`); 1 real design bug found & fixed during verification (report skipped entirely when the kill switch was off). Item 2 verified at logic level only — frontend has no test tooling |
| F10 | Testing & verification harness | ✅ Done, verified | Claude (session) | 78 passing / 0 skipped / 0 failing in 48s (43 total at start of 2026-08-19). Last blockers cleared: Playwright installed, callback test now starts its own server, and `applyBotSelect.js` went 16.98% -> 69.75% line / 100% branch. `npm run test:coverage` added |
| F11 | Credential & session management UX | ✅ Done, verified | Claude (session) | Both halves built: Settings credential CRUD + `ApplyBotLiveView` wired into AutoApply. Verified through a real browser, 9/9 checks. 3 pre-existing bugs found and fixed (stale `paused_captcha` in 3 places incl. a polling bug, `pauseReason` never exposed by the API). Frontend now has tests: 16, zero new dependencies |
| F12 | Live-mode rollout & safety ops | 🟡 Unblocked, not started | Unassigned | F5/F6/F8/F9/F10 all done now — no build blockers left. What remains is F12 own checklist: scheduler actually wired, Railway grace period increased (see Decisions Log 2026-08-17), kill-switch drill, and the first real live-mode application |
| F13 | Unified application tracking (source, resume link, ghosted) | ✅ Built, ⚠️ untested | — | Closes the pre-existing "Apply button doesn't track" gap too — see Decisions Log 2026-08-17 |
| F14 | Email-based application status auto-detection | 🔵 Researched + specified, not built | Unassigned | User opted in to scoping this — needs a real Google Cloud OAuth app before any code can be tested |

Legend: ✅ done and verified · 🟡 built but unverified/needs work · 🔴 not started · ⚠️ flag worth reading before touching

---

## Decisions Log

### 2026-08-19 — F11 completed: credential UI, live-view wired to F7's real backend, and three pre-existing frontend bugs found on the way
Branch: `f11-credential-ux` (off `f10-testing-harness`; F8/F9/F10 are all still
unmerged to `master`).

**Both halves of F11 are built.** The Settings credential CRUD lives inside
`Settings.jsx`, as the plan's file manifest requires. The shape of that UI is
dictated by one existing rule: the API never returns a stored secret
(`applyCredentials.js`'s `publicCredential` strips every encrypted field), so there
is no "edit" that pre-fills anything — saving always means typing a fresh username
and password, and the dialog says so out loud when one is already stored. Deleting
asks for confirmation, because it silently stops the bot applying to that platform
altogether.

`ApplyBotLiveView.jsx` is finished and now wired into `AutoApply.jsx`, which grew a
banner at the top for tasks sitting at `paused_human` — those are doing nothing at
all until a person clears them, and they time out (`applyBotSweep`'s
`PAUSED_STALE_MS`), so burying them as one more row in a long table was not good
enough.

**Three pre-existing bugs, all found by wiring rather than by reading:**

1. **The frontend was still on the pre-F7 status name.** `paused_captcha` appeared in
   three files while the backend has written `paused_human` since F7 renamed it. The
   damaging one was `useApplyTasks.js`: its `ACTIVE_STATUSES` set drives a 5-second
   refetch, and because the real paused status was not in it, polling **stopped at
   exactly the moment a task started needing a human**. F7's scope was backend-only
   and nothing carried the rename across; F11 owns this UI, so it was fixed here.
2. **`routes/applyTasks.js` never exposed `pauseReason`.** F7 added the column and
   nothing surfaced it, so the live-view had no way to tell "solve a CAPTCHA" from
   "fetch a code from your inbox" — it could only ever have said "something needs
   attention". One additive field on `publicTask`.
3. **`npm ci` fails outright in `frontend/`** — recorded under Open Questions since it
   blocks deployment, not this feature.

**Design calls worth not re-litigating:**
- Contract B's message building/parsing and the 0..1 pointer normalization live in a
  pure module (`lib/liveViewProtocol.js`), not in the component. They are the parts
  that fail *silently*: a coordinate outside 0..1 throws nowhere, the apply-bot side
  just denormalizes it and clicks off-page. Pulling them out is what made them
  testable at all.
- `parseServerMessage` refuses any frame whose `image` is not a `data:` image URL.
  The frame is assigned straight to an `<img>` src, so that is the one place a buggy
  or hostile server could otherwise put an arbitrary URL into the page. It returns
  null rather than throwing — one bad frame must not tear down a session a human is
  midway through.
- Mouse moves are throttled to one per 50ms. Unthrottled `onMouseMove` fires far
  faster than the far side can act on, over a socket already carrying screenshots.
- An emailed code gets a normal text input next to the canvas rather than requiring
  the human to click into a remote field pixel-perfectly.

**The frontend has tests now**, which it never did — that gap is why F9's
`SchedulerAlert` items could only be checked at logic level. Node's built-in runner
works on this ESM codebase with **zero new dependencies**, so `npm test` exists on
both sides of the repo: 16 tests in `frontend/test/liveViewProtocol.test.js`.

**Verification.** `npm run build` succeeds (2327 modules, no errors). Items 1-3 of
TEST_PLAN's F11 were driven through a real Chromium against the built frontend served
by the backend — sign in, add a Greenhouse credential through the UI, confirm the
password appears nowhere in the text, the DOM, or the API response, delete it through
the UI, confirm it is gone: **9/9 checks passed**. Items 4-5 are the 16 protocol
tests. Suites: frontend 16/16, backend 78/78, 0 skipped, 0 failing. All three test
users created during verification were deleted; the database is back to 1 user, 10
`ApplyTask` rows, 1 credential.

### 2026-08-19 — F10 completed: the suite now runs itself, and the riskiest file in the feature finally has tests
Branch: `f10-testing-harness` (off `f8-generic-engine`, since F8/F9 are not merged to
`master` yet and this touches the same test tree).

**The finding that shaped the work: a test nobody was running.**
`applyTaskCallback.test.js` required somebody to have started a backend by hand
(`npm run dev`) in another terminal before `npm test`. In practice that almost never
happened, so the one test guarding callback idempotency — the guard against a
duplicate `submitted` callback creating a second `Application` row — quietly skipped
on essentially every run while still *looking* present in the suite. It now mounts the
`internal.js` router on a throwaway server on an ephemeral port, so a live
`DATABASE_URL` is the only external thing it needs. `TEST_BASE_URL` still points it at
a real backend for anyone wanting the full middleware stack. Deliberately does **not**
require `src/app.js`: that binds port 5000 and starts the scheduler and AI workers as
an import side effect.

**The second finding came from actually measuring.** `npm run test:coverage`
(`--experimental-test-coverage`, no new dependency) put `applyBotSelect.js` at
**16.98%** line coverage — the file holding the daily cap, both dedupe rules, the
credential requirement and the F8 generic gate. Every rule that stops the bot doing
something it should not, with no automated test at all, on the file F12's live-mode
rollout depends on most. Now **69.75% line / 100% branch** via 11 tests covering the
cap, the already-capped case, in-flight dedupe, `unknown_outcome` blocking a job
indefinitely, company dedupe case-insensitively, missing and inactive credentials, the
F8 gate in both positions, the F8a rewrite, non-https refusal and inactive jobs.

`selectForUser` was exported to make that possible — `runApplyBotSelection()` loops
over every user in the database, which no test may do against a shared one. Marked in
the source as exported for tests only.

**Honest reading of the whole-backend number.** Overall line coverage is 59.20%
(branch 82.49%), which is under the 80% line target. That is not the apply-bot feature:
its files sit at 65-98%. The number is dragged down by pre-existing code outside this
feature that has never had tests — `jobFetcher.js` 27%, `matchingEngine.js` 36%,
`storageService.js` 42%, `dailyJobFetch.js` 17%. Raising those is real work and worth
doing, but it is not F10, and padding this feature's tests would not move it.

**Also closed:** the "blocked on a real Playwright install" item. Chromium is installed,
so `fieldTaxonomy.bestMatch` against a fixture DOM and `looksLikeLoginPage` against
fixture pages both run for real. The suite now has **zero skips** with a database
present.

**One self-inflicted failure worth recording**, since it is exactly the class of thing
this ticket exists to catch: the first draft of the new tests invented
`ApplyCredential` field names (`passwordCiphertext`/`passwordIv`/`passwordAuthTag`)
instead of reading the schema, and 9 tests failed at once on a single root cause. The
real fields are `credentialEncrypted`/`iv`/`authTag`, all `Bytes`. They are seeded with
dummy bytes on purpose — `selectForUser` only checks that an active row exists and
never decrypts, so encrypting for real would make these tests depend on
`APPLY_BOT_MASTER_KEY` and fail for a reason unrelated to what they assert.

**Verification.** With `DATABASE_URL`: 78 passing, 0 skipped, 0 failing, 48s — inside
the "under a minute" definition of done. Without it: 57 passing, 8 skipped, 0 failing,
5s, so a plain CI checkout is unaffected. Test rows are seeded per-test under their own
throwaway user and deleted in a `finally`; enqueued BullMQ jobs are removed
individually by `applyTaskId` rather than by draining the shared queue.

### 2026-08-19 — F8 completed: 611 misrouted jobs recovered, generic adapter implemented, F8c researched and closed
Branch: `f8-generic-engine`. Follows the same day's scoping-pass entry below, which
is where the evidence behind all of this lives.

**F8a shipped, with the behaviour change signed off first.** `resolvePlatform()` now
treats a `gh_jid=` query parameter as Greenhouse regardless of hostname, and
`resolveNavigationUrl()` rewrites those postings to the embed form. Live measurement
after the change: jobs resolving to `greenhouse` went **486 -> 1097**, `generic` fell
**1088 -> 477** — the 611 predicted by the research, exactly.

The signed-off consequence, restated because it is the part that affects users: those
611 jobs now sit on a platform where `requiresCredential()` is true, so a user with no
stored Greenhouse credential sees them as *skipped* rather than *attempted*. That is
recorded as an assertion in `applyBotPlatform.test.js`, not just as a comment.

**Two details in that implementation that are easy to get wrong later:**
- It rewrites to the **legacy** `boards.greenhouse.io` host, which accepts `token`
  alone and lets Greenhouse fill in the employer's board slug itself on redirect.
  The modern `job-boards.greenhouse.io` host requires `for=<slug>` and served no form
  without it on all 7 postings probed. Do not "modernise" that constant.
- `gh_jid` is accepted only if it is **digits**. It arrives from third-party job
  feeds and is interpolated into a URL the bot then navigates to.

**Application.applyUrl now diverges from ApplyTask.applyUrl, deliberately.**
`routes/internal.js` writes the *employer's* posting URL to the Application, while the
task keeps the embed URL it actually navigated. Handing someone a bare embed form as
the record of where they applied would be a downgrade.

**genericAdapter.js implemented** (its TODOs filled in, file shape untouched). Follows
`ashbyAdapter`'s scan -> `bestMatch` -> `nth(index)` pattern rather than inventing a
second one. Notable choices: it tries a single `full_name` field first and only falls
back to the `first_name`/`last_name` pair (filling both shapes would put a full name
into a "First name" box); a split name only counts if the *first* name landed; it
reports confidence **70** when everything required is present — above `worker.js`'s
threshold of 60, below the 80 the selector-verified ATS adapters claim, because it
inferred every field from labels it has never seen. `locateSubmit`'s patterns are
**anchored**: an unanchored `/submit|apply/` matches "Apply to other jobs", and on a
form of unknown structure a wrong click is worse than finding no button at all.

**F8c researched and closed without building.** 16 real aggregator postings, 2 per
host across all 8 hosts. Only 3 of 16 (19%) reached a fillable form by following the
apply link — and 2 of those 3 landed on Greenhouse and Ashby, platforms we already
have verified adapters for. The blockers on the rest are structural, not heuristic:
weworkremotely.com puts the apply behind *"Create an account to view full job"*;
remoteok.com's "Apply" is a `/l/<id>` gateway that bounced back to the same page;
himalayas.app, mustakbil.com and remotive.com expose **zero** apply anchors at all.
Recorded honestly: the probe's own link-picking misfired on arbeitnow.com, following
a blog post called "Applying for German Citizenship", so the real ceiling is somewhat
above 19% — just nowhere near enough to justify the build. If it is ever revived, the
order the evidence supports is a JazzHR adapter first, then a link-follower whose only
job is re-resolving into an existing adapter, and generic filling last.

**Verification.** Live against real Neon with the backend running: a full selection
run created **70 tasks, all greenhouse, zero generic** (the gate regression, with 477
generic-platform jobs sitting eligible), and **17 of those 70** stored a rewritten
embed URL while their Application link still pointed at the employer's posting. Seven
freshly-sampled employer-hosted postings across seven different employers — none
previously probed — all served a real application form at the rewritten URL. All four
of TEST_PLAN's original F8 items are now checked, plus two added for F8a. Suite: **64
passing, 1 skipped (needs a running server), 0 failing** — up from 43 total at the
start of the day.

One test failure during this work was **my own test's bug**, not the code's:
`isSafeUrl` returns a plain boolean and the first draft asserted on a `{safe}`
object. Worth noting only because the SSRF assertion would have silently passed
against `undefined` had it been written the other way round.

**Cleanup**: every task created during verification (15 + 70) was deleted and the
queue drained; the database is back to its pre-session state (10 `ApplyTask` rows,
1 user). The raised `APPLY_BOT_DAILY_CAP=80` was passed per-process for one run only
and never written to `.env`.

### 2026-08-19 — F8 scoping pass done with a real 20-URL corpus; the evidence reframes the feature, and one real engine bug was found and fixed (F8b)
Branch: `f8-generic-engine` (branched from `f9-failure-measurement`, since F9 is not
merged to `master` yet and both touch `applyBotSelect.js` — branching off master
would have set up a conflict for no benefit).

**Why a scoping pass and not code.** `TECHNICAL_PLAN.md`'s F8 section said its
definition of done was undefined pending exactly this research, and
`01-research-plan.md` §E demanded a real corpus *before* touching `SYNONYMS`. So the
corpus was built first: 20 real `applyUrl`s sampled to span all 16 hosts that
`resolvePlatform()` calls `generic`, visited with real headless Chromium, scanned
with the **real** `scanFields`/`bestMatch` (not a reimplementation). Read-only —
nothing typed, uploaded or submitted anywhere.

**The headline: only 1 of 20 (5%) landed on a directly fillable form.** 9 were
listing/redirect pages, 6 were a known ATS behind a company domain, 4 were listing
pages whose field count was inflated by search/newsletter boxes. Full findings are
written into `01-research-plan.md` §E; the F8 section of `TECHNICAL_PLAN.md` has been
rewritten with an evidence-based DoD that splits F8 into F8a/F8b/F8c.

**The finding that reframes the feature: 56% of "generic" is Greenhouse.** Measured
across the whole database, **611 of 1088** URLs that resolve to `generic` carry a
`gh_jid=` parameter — Greenhouse's own job id. `resolvePlatform()` only inspects
`hostname`, so Greenhouse boards served on samsara.com, coinbase.com, stripe.com,
instacart.careers, databricks.com, careers.airbnb.com, jobs.dropbox.com and asana.com
are invisible to it. That is 21.8% of all active jobs pointed at a generic engine that
does not exist instead of at the already-verified F5 adapter.

**A negative result worth as much as the positive one.** The obvious fix — rewrite to
`job-boards.greenhouse.io/<company>/jobs/<gh_jid>` — was probed on 6 of them and **all
6 redirected straight back** to the company's own careers page. Greenhouse bounces the
canonical board URL for embedded-board customers. What works is the embed URL
(`/embed/job_app?for=<company>&token=<gh_jid>`): probed on 4, all 4 served a real
application form. Anyone implementing F8a must use the embed URL — the canonical one
looks right and silently does nothing.

**Real bug found and fixed (F8b).** On 4 of 4 live Greenhouse embed forms the resume
file input is labelled **"Attach"** and carries `id="resume"`. `'attach resume'` is not
a substring of `'attach'`, so no label matched; the id/name path scored it at
`NAME_ATTR` (35), under `MIN_CONFIDENCE_TO_FILL` (60) — so the strictest gate in the
engine (per §04) failed on a completely unambiguous signal, and every one of these
forms would have abstained over one word. Fixed by adding
`NAME_ATTR_TYPE_CONFIRMED` (75): when `bestMatch` has *already* restricted candidates
by element type (`resume_upload` -> `type="file"`), an id/name hit is corroborated
rather than speculative, and deserves to clear the bar. Deliberately **not** fixed by
adding an `'attach'` label synonym — these forms carry two file inputs, `id="resume"`
and `id="cover_letter"`, both labelled "Attach", so a label synonym would have picked
the wrong one about as often as the right one. Also hardened the id/name path to
word-boundary matching while in there, so the two-letter `'cv'` synonym cannot hit an
unrelated id like `cvv_scan` — that path was previously dead code for fill decisions
(35 always lost to the 60 threshold), so this is the first time it can actually
decide anything and the looseness started to matter.

**Not affected: the shipping Greenhouse adapter.** It reaches the resume input via a
hardcoded `#resume` selector and never consults the taxonomy for that field, so this
bug was confined to F8's generic path. Verified as a side effect that `#resume` does
match on the embed forms (1 element) — which is what makes F8a viable at all. Its
companion selector `input[type="file"][name*="resume" i]` matches **0** there, since
those inputs have an empty `name`; worth knowing before anyone "tidies up" that pair.

**Also contradicted: §04's assumption about which lever matters.** §04 says the first
tuning lever is the synonym list. On the one genuinely fillable form in the corpus (a
JazzHR board at `applytojob.com`, reached only by following workingnomads.com through
a redirect) the existing synonyms matched every required field at confidence 80 with
no gaps at all. The corpus says the real first lever is *reaching a form*, not naming
its fields.

**Verification.** 5 new browser-free regression tests in
`backend/apply-bot/test/fieldTaxonomy.test.js` (kept in the existing file — no new
file, so the locked manifest is untouched). Against live pages: the 4 Greenhouse embed
forms flipped from "required field missing" to fully matched, and re-scanning the
original 20-URL corpus produced an **identical** verdict tally, confirming no new
false positives on the 9 listing pages. Suites: apply-bot 30/30 passing with 0 skipped
(Playwright is installed now, so F10's two browser-dependent stubs finally run);
backend 52 passing, 1 skipped (needs a running server), 0 failing.

**Open, needs a call before more F8 code:** F8a changes routing for 611 real jobs
onto a platform where `requiresCredential()` is true — a user without a stored
Greenhouse credential goes from "generic, attempted" to "skipped". That is a
behaviour change, not a refactor, so it is not something to just do.

### 2026-08-19 — F9's remaining half built and verified against real Neon; 1 real design bug found and fixed during verification
Branch: `f9-failure-measurement` (branched from `master` after F7 merged in).

**Why F9 and not F8, even though F8 is the next number.** F8 was the obvious next
ticket by sequence, but `TECHNICAL_PLAN.md`'s own F8 section says
*"Definition of done: not defined yet — this feature needs its own scoping pass"*,
and `01-research-plan.md` §E requires a corpus of 15-20 real non-ATS apply forms
built **before** any synonym tuning. Building it now would have meant inventing a
definition of done, which `CLAUDE.md` explicitly forbids. F9 was chosen instead: its
DoD is crisp, it's Wave 1 (zero file conflicts), and F12 is blocked on it. **F8 still
needs its scoping pass — that's the real next decision, not a coding task.**

**What was built.** `jobs/applyBotFailureReport.js` (the file the plan had already
named and scaffolded — filled in, not restructured). Two `groupBy` queries produce
§03's overall success rate, abstain rate, failure-class breakdown, and per-adapter
success rate over a rolling window. Runs automatically after each `applyBotSelect.js`
run, on demand as a CLI, and persists each run as an `apply-bot-failure-report`
`SchedulerLog` row (full JSON in the existing `sourceBreakdown` column — no schema
change, no migration).

**The real bug, found by verifying rather than by reading.** The first version put
the report call at the *end* of `runApplyBotSelection()`, after the kill-switch
early-return. Triggering the endpoint with the switch off proved it: the report
never ran. That's backwards — the sweep above it is deliberately unconditional
because *"cleaning up stale tasks from BEFORE the feature was disabled is still
correct"*, and the identical argument applies to reporting: a team that just turned
the bot off after a bad week is exactly the team that needs the numbers explaining
why. Moved above the kill-switch check; both paths now return a report.

**A second thing verification caught, worth writing down.** Triggering
`/api/internal/apply-bot/trigger-select` created 15 real `ApplyTask` rows — because
Redis's `apply_bot:enabled` key was `"true"` from an earlier session and **overrides**
`APPLY_BOT_ENABLED="false"` in `.env` (by design, see `applyBotSelect.js`). The env
var is only a boot-time default. Anyone triggering selection during local testing
should check the Redis key first, not the `.env` file. The 15 rows were deleted, the
queue drained, and the key restored to `"true"` (its original value) afterwards.

**Design calls made, both defensible either way — recorded so they aren't silently
re-litigated:**
- A rate with a zero denominator returns `null`, never `0`. A brand-new adapter with
  no resolved tasks would otherwise read as a 0%-success (i.e. broken) adapter.
- §03's ">50% per-adapter failure rate" alert is a `logger.warn` with a
  20-resolved-task minimum, **not** a dashboard banner — §03 itself says not to build
  alert UI before there's real volume to calibrate against.
- The report is global (no `userId` filter): "what's *our* Greenhouse success rate"
  is a team question. Note this differs from the dashboard's `applyBotNeedsReview`,
  which is deliberately per-user. Both are correct for their own purpose.
- §03's §3 CAPTCHA-hit rate, §6 confidence histogram and §7 cap check were left out
  as out-of-scope for F9's stated remaining half. §3 is the likeliest next addition —
  it's the before/after metric for F7's live-view work.

**Verification (all 4 TEST_PLAN F9 items, against real Neon + a locally-running
backend).** Items 1 and 3 end-to-end through `GET /api/dashboard`: a freshly
registered user read `0` while the database globally held 3 `unknown_outcome` rows
owned by someone else (proving the count is correctly per-user), then `0 → 2 → 1 → 0`
as seeded rows were resolved one at a time. Item 4 is now automated —
`backend/test/applyBotFailureReport.test.js`, 5 tests, isolated by seeding under a
unique per-test `adapterUsed` name so the global report's numbers stay exactly
assertable without adding a test-only filter to production code. Item 2 was verified
at logic level only: the real `applyBotOverdue` expression was extracted from
`SchedulerAlert.jsx` and evaluated (`null` → no banner, live 4h-old value → no
banner, 26h-old → banner). **Honest limit**: that is not a rendered-component test —
the frontend has no test tooling at all (no vitest/RTL), and the never-run `null`
case couldn't be produced end-to-end without deleting this database's real
`apply-bot-select` history.

Also: the DoD was demonstrated literally — `node -r dotenv/config
jobs/applyBotFailureReport.js 7` answered "what's our Greenhouse success rate this
week" (`greenhouse 22.2% (2/9)`, `lever 0% (0/3)`, `TIMEOUT: 3, CAPTCHA: 3`) with no
hand-written query. Full suite after the change: **47 passing, 3 skipped
(Playwright-only), 0 failing.** The verification user and all rows it created were
deleted; the database is back to its pre-session state (1 user, 10 `ApplyTask` rows).
The `apply-bot-failure-report` `SchedulerLog` rows written during verification were
left in place — they're accurate records of runs that really happened.

### 2026-08-19 — F7 built and verified against a real hCaptcha; critical pause-aware-deadline requirement confirmed with real evidence; 1 real security bug fixed
Branch: `f7-captcha-live-view` (branched from `master` after merging F6 in).

**A genuine mid-session scare, resolved as a false alarm — recorded because the
lesson is real even though the incident wasn't**: partway through this ticket, a
batch of "file changed on disk since you last read it" notices showed several F7
files (`worker.js`, `liveView.js`, `schema.prisma`, others) reverted to their
pre-F7 content, and a `git status`/`git branch --show-current` pair run
immediately after appeared to show the working tree on `f2-backend-orchestration-api`
with a clean tree — i.e., it looked like all of F7's uncommitted work had been
silently discarded by a branch switch neither typed nor intended, mirroring F4's
process note about branch-state surprises. Immediately re-ran `git status`,
`git branch --show-current`, and `git log -3`, plus a direct `grep` for
F7-specific code in `worker.js`/`liveView.js`: everything was actually present and
correct, on the correct branch, correctly based on `master` (which has F1-F6).
The earlier alarming output was a stale/transient artifact (most likely explanation:
several `run_in_background` server processes were active simultaneously at that
point, and one Bash call's result got crossed with a stale buffer) — not a real
event. **Why this is worth recording despite being a non-event**: the correct
response to "my work might be gone" is to verify immediately and directly (fresh
`git status`, `git log`, `grep` for known-recent content) before either panicking
or, worse, assuming the alarming signal was itself wrong without checking — this
time the verification confirmed nothing was lost, but the verification step is
what actually established that, not a hope that it would be fine.

**Implemented the plan's required generalization**: `paused_captcha` → `paused_human`
+ `pauseReason` (`'captcha' | 'email_verification' | 'unknown_challenge'`) throughout
— schema (`ApplyTask.pauseReason`, new migration), the callback API's Zod schema
(additive, `pauseReason` required exactly when `status: 'paused_human'` via
`.refine()`), `applyBotSweep.js`'s stale-pause cleanup (now reads each task's own
`pauseReason` to pick the right `failureClass` instead of hardcoding `CAPTCHA`),
and `applyBotSelect.js`'s in-flight dedupe check.

**Full pause→live-view→resume cycle verified against a real, currently-open Lever
posting** (the same H1 posting F4 confirmed has hCaptcha): seeded a real `ApplyTask`,
watched the worker detect the real CAPTCHA and correctly enter `paused_human` with
`pauseReason: 'captcha'` (not fail immediately, matching the whole point of this
feature), connected an authenticated WS test client to
`/api/apply-bot/live/:taskId` (real session-cookie auth verified against the actual
Redis session store, not mocked), received real JPEG screenshot frames of the live
browser session, sent `mark-resolved`, and confirmed the task actually resumed
(not just acknowledged) — it re-checked the challenge (deliberately not trusting
the human signal blindly) and, since the real CAPTCHA genuinely wasn't solved in
this test, correctly failed with "still present after being marked resolved"
rather than hanging, crashing, or proceeding to fill a form behind a live CAPTCHA.
This is real evidence the entire chain works, not three pieces individually mocked.

**Critical requirement verified with real evidence, not just code review**: the
plan explicitly flagged that a naive `TASK_DEADLINE_MS` would silently kill a
legitimately-paused task the first time a real CAPTCHA was hit, and asked for this
to be proven, not assumed. Restructured `processTask()`'s deadline from a single
`setTimeout` into a 1-second polling tick that freezes elapsed-time accounting
while `ctx.paused` is true (set/cleared around `waitForHumanResolution()`).
Verified with `TASK_DEADLINE_MS_OVERRIDE=8000`/`PAUSE_TIMEOUT_MS_OVERRIDE=25000`
(same dev-only override pattern as F3): a paused task survived past the 8-second
task deadline completely untouched and only timed out at ~27 seconds — matching
the pause timeout, not the task deadline, exactly the distinction that matters.

**Real security bug found and fixed**: `liveView.js`'s original
`X-Apply-Bot-Secret` check ran inside the `connection` event handler — but `ws`
completes the WebSocket handshake (firing the client's `open` event) *before*
`connection` runs, so an unauthorized client's connection briefly succeeded before
being closed a moment later. Confirmed this gap directly: a test client with a
wrong/missing secret saw its `open` event fire. Fixed by moving the check into
`verifyClient` (runs during the HTTP upgrade, before any handshake response is
sent) — re-tested after the fix: the same wrong-secret client now gets a plain
HTTP 401 and its `open` event never fires at all. Also implemented and verified
the backend-side proxy authentication (`applyBotLive.js`): manually parsing and
unsigning the `express-session` cookie (a raw WS upgrade never runs through the
`session` middleware) against the real Redis session store, then checking task
ownership — confirmed rejecting both a missing cookie and a task-id the
authenticated caller doesn't own, both with 401 before any proxying happens.

**A genuinely tangential but real finding, fixed and documented, not chased
further than warranted**: `npx prisma migrate dev` refused to proceed, reporting
`20260818170025_apply_bot_and_tracking` "was modified after it was applied" — the
actual cause was Windows' `core.autocrlf` silently converting that migration's
LF line endings to CRLF on checkout, changing the file's checksum from what was
recorded when it was first applied (in F1). `migrate deploy`/`migrate status`
(what production's actual start command uses) were unaffected — this only blocks
the local-dev convenience command. Fixed going forward with a new
`.gitattributes` rule (`-text` on `backend/prisma/migrations/**/migration.sql`,
so git never touches their line endings again) and re-normalized the three
existing migration files to LF. Deliberately did not chase this further once the
non-blocking nature was confirmed and the recurrence was prevented — matches this
session's standing rule of following a real finding to a real fix without
over-investing past the point of diminishing return.

**Deliberately not exercised, honestly documented rather than skipped
silently**: a mouse/keyboard event round-trip through the live view (the
`mark-resolved` signal path was tested end-to-end instead, which exercises the
resume mechanism itself; the input-relay code was reviewed by inspection but not
proven against a real click), and the email-verification challenge path against a
real occurrence (rare/hard to reproduce deterministically per the original
research — `detectEmailVerification()`'s pattern list and `worker.js`'s handling
are symmetric with the CAPTCHA path and share its test coverage by construction,
but the text patterns themselves are unverified against a real prompt). Also not
built here, correctly out of scope: the frontend live-view component itself
(`ApplyBotLiveView.jsx`) is F11's responsibility per the plan's own division —
this session verified the backend/apply-bot halves of Contract B using a raw test
WS client standing in for the frontend, exactly as the plan anticipated two
people could do independently.

**Why**: same bar as F1-F6, applied to the highest-complexity feature in the whole
plan — real evidence for the pieces that could be tested against a real live
system (the actual point of this ticket, the pause-aware deadline, was proven, not
just reasoned about), and an honest accounting of the two pieces that couldn't be
(a real human click, a real email-verification prompt) rather than a checkbox that
looks the same either way.

### 2026-08-19 — F6 verified against 5 real live Ashby postings; 2 real bugs found (a genuine hydration race this time, plus a click-through flow), CAPTCHA question resolved
Branch: `f6-ashby-adapter` (branched from `master` after merging F5 in; `git log
--oneline -3` checked immediately after `git checkout -b`, per the now-standard
process check).

Found 5 real, currently-open postings across 4 companies' Ashby boards (Valon,
Ashby's own careers page, Ramp ×2, Linear) by visiting each board directly rather
than trusting search-indexed job IDs (learned from F5's domain-migration close call).

**Bug #1 — a genuine hydration-timing race, not a false alarm this time.**
F5's equivalent test (Greenhouse, zero extra wait after `domcontentloaded`,
immediate `fillApplication()` call) passed instantly with no fix needed, because
Greenhouse's adapter uses Locator-based `.fill()`/`.setInputFiles()` calls, which
auto-wait for their target element. Ashby's adapter is built entirely on
`fieldTaxonomy.js`'s generic engine, whose `scanFields()` runs a single, synchronous
`page.evaluate()` — no auto-wait at all. Running the identical test against Ashby
found **zero fields** on the inline-form postings. This is the real, not just
theoretical, version of the risk F6's own plan section flagged ("Ashby's form is
more dynamically-rendered... prioritize getting real field-label data from a live
posting"). **Fix**: `ensureApplicationFormVisible()` now explicitly
`waitForSelector`s the name field before scanning. Re-verified against the exact
same zero-wait scenario afterward — filled correctly every time.

**Bug #2 — some postings require a click-through to a separate `/application`
page.** 2 of the 5 postings tested (Ashby's own board, one Ramp posting) don't
render the form inline on the job listing page at all — an "Apply for this Job"
link/button must be clicked first, which navigates to a `.../application` URL
where the actual form lives. Without handling this, `fillApplication()` would scan
an essentially empty page and abstain with `skipped_low_confidence` — safe, but a
missed application that was one click away, not a crash or a wrong guess. Fixed by
the same `ensureApplicationFormVisible()` function: if the name field isn't found
within 5s, look for and click the "Apply for this Job" control, then wait again
(10s) before giving up. Both fixes share one function since the wait-then-maybe-
click sequence naturally covers both cases without duplicating logic.

**Field-matching itself needed no changes**: `fieldTaxonomy.js`'s existing
`SYNONYMS` correctly matched all of Ashby's real field labels ("Phone", "LinkedIn
Profile", "LinkedIn  Profile" — note the real double-space typo on one posting,
still matched fine since matching is substring-based —, "Website", "Github") via
label text on all 5 postings, no additions needed.

**CAPTCHA question resolved — not observed, opposite finding from F4/F5**: unlike
Lever and Greenhouse (both 100% CAPTCHA-present across every posting tested in
their own sessions), none of the 5 Ashby postings tested showed any CAPTCHA
widget. Genuinely new information (the plan explicitly flagged this as unconfirmed
by research) — recorded as a real finding from this specific sample, not a
guarantee about every Ashby-hosted board.

**Not exercised**: the login-page/AUTH-failure regression against a real gated
board — same situation as F4/F5, all 5 tested were guest-apply.

**Why**: same bar as F1-F5. Worth noting explicitly this time: F5's timing test
was a genuine "nothing to fix" result and F6's was a genuine "real bug, fix
required" result for the equivalent question on a different adapter — the value
of actually running the test each time is exactly that you don't know which
outcome you'll get until you do, even when the underlying concern (React
hydration timing) sounds the same across adapters.

### 2026-08-19 — F5 verified against 5 real live Greenhouse postings; domain migration caught, hydration question resolved, no code bugs found
Branch: `f5-greenhouse-adapter` (branched from `master` after merging F4 in — `git
log --oneline -3` checked immediately after `git checkout -b` this time, per the
process note in F4's entry).

**Domain migration caught before wasting the whole session on dead postings**: the
adapter's own comments and this test plan both assumed `boards.greenhouse.io`.
5 real job IDs found via search (Applied Intuition, ZipRecruiter, Invisible Tech,
tastytrade, Sourcegraph) ALL redirected to `job-boards.greenhouse.io/<company>?error=true`
— Greenhouse has fully migrated domains, and the old one now just error-redirects
rather than 404ing cleanly (would have looked like "all 5 test postings happened to
be dead" if not investigated further). Found live postings by visiting each
company's actual `job-boards.greenhouse.io` board page directly instead of trusting
stale search-indexed job IDs.

**Selectors verified correct as-is — no code bug found here** (unlike F4's Lever
adapter, which had 2 real bugs): the new React-rendered board dropped `name`
attributes entirely (every input's `name` is empty) but kept the same `id` values
(`#first_name`, `#last_name`, `#email`, `#resume`) that the adapter already checks
first. Confirmed on all 5 postings via two independent checks per posting: the
adapter's own return value AND a direct DOM read of the actual filled values.

**Resume-upload false alarm, caught and resolved by digging one level deeper**:
initial testing showed `resumeFileCount: 0` after fill on all 5 postings — looked
like a serious bug (silent upload failure) at first. Investigation found the real
cause: Greenhouse's React form unmounts/replaces the `#resume` `<input>` element
once a file is accepted (confirmed via `document.querySelectorAll('#resume')`
returning empty afterward, while the accepted filename WAS present in the
page's rendered text) — a UI implementation detail, not a failure. Re-tested by
checking for the filename in the page body instead, which needed to be
poll-based rather than a fixed delay (a fixed 1000ms wait found the filename on
only 2/5 postings — timing, not failure, since the re-render is async; polling
up to 5s found it on all 5). Worth recording precisely because this is exactly
the kind of thing that could have shipped as an incorrectly-reported "bug fixed"
if the first (misleading) result had been trusted without digging further.

**CAPTCHA confirmed present on all 5 — and caught a real "sometimes invisible" case
live**: reCAPTCHA (`iframe[src*="recaptcha"]`) present on all 5. On 4/5 it rendered
immediately on page load; on 1 (ZipRecruiter) `detectCaptcha()` returned
`detected: false` *before* `fillApplication()` ran but `detected: true` *after* —
a real, directly-observed instance of the plan's "sometimes invisible, triggered
by behavioral signals" concern, not just a theoretical risk. Confirms
`worker.js`'s existing design (checking `detectCaptcha()` both before AND after
`fillApplication()`) is genuinely load-bearing, not defensive-but-unnecessary —
the pre-fill-only check alone would have missed this case entirely.

**Hydration-timing question resolved: no wait needed.** Tested with
`worker.js`'s exact real navigation option (`page.goto(url, { waitUntil:
'domcontentloaded' })`, no `networkidle`, no extra sleep) immediately followed by
`fillApplication()` — filled correctly on the first attempt every time. Playwright's
locator-based `.fill()`/`.setInputFiles()` calls already have built-in
actionability auto-waiting, which is what makes this safe without an explicit
`waitForSelector`. No adapter change made.

**Custom questions confirmed never guessed at**: every posting had multiple
custom `question_NNNN` fields (interview logistics, work authorization, etc.) —
none were ever filled. Precision note added to the file's own header and to
`TEST_PLAN.md`: the adapter's `unmapped`-recording behavior is scoped to
`phone`/`linkedin_url`/`portfolio_url` specifically (confirmed present as
*required* fields on 4/5 postings, direct evidence for the still-open
phone/LinkedIn schema question above) — other custom questions are silently
left untouched rather than explicitly flagged `unmapped`, which is the same
never-guess safety property, just without a label in the JSON for those.

**Not exercised**: the login-page/AUTH-failure regression against a real gated
board — all 5 tested were guest-apply, no login required, same situation as F4.
The generic `looksLikeLoginPage()` mechanism is fixture-tested (F10, passing) and
was confirmed to correctly return `false` (not a false positive) against all 5
real pages.

**Why**: same bar as F1-F4. Two things worth calling out specifically about this
session: catching the domain migration before it silently invalidated the whole
verification effort, and not stopping at the first (misleading) resume-upload
result — a real bug and a false alarm can look identical from the first data
point; the difference only shows up once you check the actual cause.

### 2026-08-19 — F4 verified against 5 real live Lever postings; CAPTCHA question resolved, 2 real bugs fixed
Branch: `f4-lever-adapter` (branched from `master` after merging F3 in).
**Process note**: the branch was first cut from a stale point (F1 only, missing F2
and F3) due to a branching mistake — caught via `git log` showing only 1 commit
where 3 were expected, before anything was committed on the bad branch. Fixed by
switching to the verified `master` (uncommitted F4 edits carried over cleanly,
since neither F2 nor F3 had touched the two files this session was editing),
deleting the bad branch, and recreating it from the correct base. Flagging this
here as a reminder for the next ticket: verify `git log --oneline -3` right after
every `git checkout -b`, not just after the preceding merge.

Since a direct HTTP fetch against `jobs.lever.co` returns 403 (Lever blocks
non-browser requests — confirmed in an earlier session, see the 2026-08-17 entry
below), real-DOM verification required an actual Playwright session, now possible
since F3 installed Chromium locally. Found 5 real, currently-open postings via web
search (2 others from the same search — Loop, Berkshire Hathaway Homestate — had
already closed/404'd by the time they were checked, a reminder that search results
for live job postings go stale fast): **Palantir, Apollo Research, Veeva, H1,
Velo3D**.

**Selectors confirmed correct as-is**: `input[name="name"]`, `input[name="email"]`,
`input[name="resume"]` matched exactly on all 5 real postings — the API-docs-based
corroboration from the 2026-08-17 entry held up against real DOM. Verified two
independent ways per posting: the adapter's own `fillApplication()` return value,
and a separate direct read of the actual DOM field values/file count afterward
(not just trusting the adapter's self-report) — plus before/after screenshots (one
visually inspected: resume filename shown, "Analyzing resume..." spinner active
confirming a real client-side upload was triggered, name/email both populated).

**CAPTCHA question resolved — yes, standard, not an edge case**: all 5 postings
render a real hCaptcha widget (`.h-captcha` div + iframe + hidden
`h-captcha-response` input + hCaptcha script tag, confirmed via direct DOM
inspection). This means the full worker pipeline (which checks `detectCaptcha()`
*before* calling `fillApplication()`) will hit a CAPTCHA failure on essentially
every real Lever posting in Phase 1 — same posture F5 already documented for
Greenhouse. Practical consequence for testing this feature: the selector
verification above was done by calling `leverAdapter.fillApplication()` directly
against the real page (bypassing the worker's pre-fill CAPTCHA gate on purpose) —
this is what F4 actually needs verified (the DOM-matching logic), separately from
F7's CAPTCHA hand-off, which is what actually unblocks the full pipeline later.

**Two real bugs found and fixed**:
1. `leverAdapter.js`'s `locateSubmit()` targeted
   `button[type="submit"]:has-text("Submit")` — Lever's real DOM has *two*
   submit-shaped buttons: an actual `button[type="submit"]` with no text at all
   (triggered programmatically after hCaptcha validates) and a visible
   `button[type="button"]` reading "Submit application" that's the one a real
   applicant clicks. The old selector matched neither — confirmed empty on both
   test postings before the fix. Fixed to `button:has-text("Submit application")`,
   confirmed matching exactly 1 element afterward.
2. `captchaDetector.js`'s `isAlreadySolved()` checked
   `textarea[name="h-captcha-response"]` — Lever's real hCaptcha integration uses
   `input[type="hidden"]`, not a textarea, so this check could never have found it
   (always fell through to the "neither widget present" branch for Lever
   specifically). Safe-direction bug (never *under*-reports a genuine CAPTCHA,
   since `detectCaptcha()`'s widget-selector check runs first and independently
   catches `.h-captcha`), but wrong — fixed to match on the attribute selector
   alone (`[name="h-captcha-response"]`), which matches either tag.

**Confirmed guest-apply across all 5**: no login required on any tested posting,
`login()`'s no-op is correct, no gated board found to test the AUTH-failure path
against for real (the generic `looksLikeLoginPage()` mechanism itself is
fixture-tested and passing — see F10 — just not exercised against a real gated
Lever board in this session).

**Deliberately not done**: live-mode submission (actually clicking "Submit
application" on a real posting) — that's F12's gate, not F4's; every test here used
`fillApplication()` directly or shadow mode, which stops one click before Submit.
No real application was ever submitted to any of the 5 employers tested against.

**Why**: same bar as F1-F3 — real evidence against real live third-party systems
wherever safely possible (shadow-only, small number of postings, no actual
applications submitted), a documented catch-and-fix for the branching mistake
rather than a silent redo, and two real production bugs caught before they'd have
surfaced as a confusing failure the first time someone actually watched a live
CAPTCHA hand-off try to click a submit button that didn't exist.

### 2026-08-19 — F3 verified end-to-end on local Windows dev (no Docker); two items genuinely env-blocked
Branch: `f3-apply-bot-service-scaffold` (branched from `master` after merging F2 in).

**Bumped the stale Playwright pin** (`1.49.1` → `1.62.1`, current stable per `npm
view playwright version`) before installing — matches the plan's own flagged risk
(see the 2026-08-17 entry above, now resolved). `npm install` + `npx playwright
install chromium` both completed clean; resolved Chromium 151.0.7922.34.

**Same TLS bug as F2, found in the mirrored copy**: `backend/apply-bot/src/bullConnection.js`
had the identical missing-`tls`-for-`rediss://` bug as the backend's copy (fixed in
F2) — makes sense, it's a deliberate mirror ("own copy for the same reason as
logger.js"), so the bug was mirrored too. Fixed identically.

**Full worker pipeline verified live**: seeded a real `ApplyTask` via the backend
(pointing at `https://www.greenhouse.io/`, not a fake URL) and enqueued it on the
real `apply-bot-tasks` queue — the apply-bot worker claimed it via the real
`GET /api/internal/apply-bot/tasks/:id`, launched a real headless Chromium, navigated
to the real page, scanned it with `fieldTaxonomy.js`, correctly abstained
(`skipped_low_confidence` — the homepage isn't an application form, so this is the
*correct* outcome, not a failure), and reported back via the real callback — the
entire F1→F2→F3 chain working together end to end, not three features individually
mocked. ~66s round trip (Chromium's first cold launch on this machine appears to be
the dominant cost, not navigation).

**`TASK_DEADLINE_MS` (TIMEOUT) verified with a real network hang, no system changes
needed**: used `<anything>.greenhouse.io.<ip-dashes>.nip.io` (nip.io is a public
wildcard-DNS test service — any hostname ending in `<ip-dashes>.nip.io` resolves to
that IP) pointed at `203.0.113.1` (TEST-NET-3, IANA-documented public-but-blackholed,
so it hangs on connect rather than erroring immediately, and — unlike an RFC1918
address — isn't rejected by our own SSRF guard, which is exactly what made it usable
for this test). Added a new dev-only `TASK_DEADLINE_MS_OVERRIDE` env var to
`worker.js` (unset in every real deployment — production always uses the real 3
minutes) so the mechanism could be tested in seconds: force-failed the hung task at
the deadline with `failureClass: 'TIMEOUT'`, and confirmed the next queued task
started just 4 seconds later — the concurrency:1 queue was never stuck.

**`maxStalledCount: 0` verified via a real crash simulation**: seeded a task,
waited for it to reach `running`, `taskkill /F` (Windows' SIGKILL-equivalent) the
apply-bot process mid-flight, restarted it, and confirmed the `ApplyTask` row was
untouched (`status: 'running'`, unchanged `startedAt`) rather than silently
reprocessed — BullMQ's own log even confirmed the mechanism explicitly ("job
stalled more than allowable limit" logged as a failure at the queue level, not a
silent redelivery), matching `worker.js`'s own comment on why this flag exists.

**Two items genuinely blocked by this environment, not skipped carelessly**:
1. **`docker build`** — no Docker installed on this machine (confirmed, matches the
   PostgreSQL/Memurai install friction noted in F1's entry — this dev machine has
   real limits on what can be installed). Not attempted; the Dockerfile was reviewed
   and its two RUN steps match what was just verified working natively (`npm ci` +
   `npx playwright install --with-deps chromium`), so there's reasonable but not
   proven confidence it'll build. **Needs an actual Docker build before trusting the
   Railway deploy path.**
2. **Real `SIGTERM` graceful-shutdown delivery** — two independent attempts to
   deliver a signal cross-process on Windows both failed silently: `taskkill`
   without `/F` is refused outright by Windows ("can only be terminated forcefully"),
   and `process.kill(pid, 'SIGTERM')` / `process.kill(pid, 'SIGINT')` from a separate
   Node process both force-killed the target with zero shutdown-handler log output —
   a known Node-on-Windows limitation (cross-process signal delivery isn't reliably
   emulated the way it is on POSIX). Verified the *code* is correct by inspection
   (`server.js` registers both signals against a shared `shutdown()` that correctly
   awaits `worker.close()` before exiting) but this specific behavior needs
   verification against the real Railway (Linux) deployment, where SIGTERM is a
   first-class signal, to be trusted operationally.

**Why**: same bar as F1/F2 — real evidence wherever the environment allows it,
and an honestly-labeled gap (with the reason and what would close it) wherever it
doesn't, rather than a checkbox that looks the same either way.

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
**Done 2026-08-19 (F3 verification session)**: bumped to `1.62.1` (confirmed still
current via `npm view playwright version`), `npm install` + `npx playwright install
chromium` both clean, resolved Chromium 151.0.7922.34 — see F3's entry below.

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

---

## Open Questions

- **`npm ci` fails in `frontend/`, which means the Railway build cannot run.**
  Found 2026-08-19 during F11. `@vitejs/plugin-react@4.5.0` declares
  `peer vite@"^4.2.0 || ^5.0.0 || ^6.0.0"`, but the project pins `vite@8.0.16`, so
  npm refuses to resolve. Railway's documented build command is
  `cd frontend && npm ci && npm run build`, so this blocks deployment, not just local
  work. Note `@vitejs/plugin-react` is **not** in `frontend/CLAUDE.md`'s pinned list,
  while `vite` is — so the fix that respects every documented pin is to bump the
  plugin to a version whose peer range includes vite 8, leaving vite itself alone.
  Not done here: it is a dependency change outside F11's scope and wants explicit
  sign-off. Local verification for F11 used `npm install --legacy-peer-deps`, which
  changes nothing in the repo. **Unresolved.**
- **What F8's definition of done actually is.** `TECHNICAL_PLAN.md` leaves it
  undefined on purpose, pending a scoping pass "once F4-F7 are done and real data
  exists on how often non-ATS `applyUrl`s actually resolve to something fillable at
  all." F4-F7 are now done, so this pass is due — and it is a research/scoping
  decision, not a coding task: `01-research-plan.md` §E wants a corpus of 15-20 real
  non-ATS apply forms collected *before* any synonym tuning. Flagged 2026-08-19 when
  F9 was picked over F8 for exactly this reason. **Unresolved.**
- Whether to add `phone`/`linkedinUrl`/`portfolioUrl` fields to `User` (schema
  change, needs explicit sign-off) vs. accepting that ATS forms requiring phone will
  always abstain. See `docs/apply-bot/01-research-plan.md` §D. **Unresolved.**
  **New evidence, 2026-08-19 (F4)**: on 2 of the 5 real Lever postings tested
  (H1, Velo3D), "Phone" and "LinkedIn URL" were both marked required (a "✱" in the
  field's label) and correctly recorded as `unmapped` rather than guessed — this is
  a real, not hypothetical, cost of leaving this unresolved: those 2 postings would
  abstain (or at minimum get a lower confidence score) purely for missing a phone
  number, on an otherwise cleanly-filled form.
- Hosting choice for `apply-bot` (Railway in-container vs. Browserbase/Browserless
  vs. VPS) — left open in the original plan pending real volume data. Browserbase
  pricing researched 2026-08-17 (Developer tier $20/mo, 25 concurrent browsers, 100
  browser-hours, includes stealth mode + auto CAPTCHA solving — though note the
  CAPTCHA-solving-doesn't-reliably-work-on-Greenhouse finding above may apply to
  Browserbase's auto-solve too; would need direct testing, not assumed). **Unresolved
  — revisit once F5/F6 have real failure-rate data (see F9).**
- ~~Whether Ashby application forms present CAPTCHAs in practice — not confirmed by
  research.~~ **Resolved 2026-08-19 (F6)**: not observed on any of 5 real postings
  tested — see that day's F6 Decisions Log entry. Not proof no Ashby board ever
  uses one, just the first real data point (same caveat F4/F5 noted for their own
  positive findings, just inverted here).

---

## How This File Relates to the Other Docs

- `docs/apply-bot/TECHNICAL_PLAN.md` — the feature-numbered technical spec, updated
  when scope changes (not for routine status updates — that's this file).
- `docs/apply-bot/01` through `05` — deep-dive research/issues/metrics/tuning/ops
  docs, referenced from the plan, not duplicated here.
- This file — the fast-moving "what's true right now" layer both of you should read
  first each time you sit down to work on this feature.

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
| F7 | CAPTCHA / bot-challenge live-view | ✅ Done, verified (2 items narrower-scope) | Claude (session) | Verified 2026-08-19 (WS auth bug fixed, pause-aware deadline confirmed live); code-review fix 2026-08-20 — 3 more real bugs: shadow mode paused for a human on every challenge (queue-blocking, same shape as F4-F6), applyBotLive.js's clientWs missing an error handler (could crash the whole backend), F2's mode-check bug carried forward from internal.js. All verified live against real Chromium/hCaptcha/ws |
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

### 2026-08-20 — F7 code-review fix: shadow mode blocked the whole queue by pausing for every challenge, applyBotLive.js could crash the entire backend on a bad client connection, F2's mode-check bug carried forward
Branch: `f7-captcha-live-view`. Same "fix every bug, verify against the test
plan" pass as F1-F6 (see those entries below) — this branch was the most
complex feature reviewed so far, and it earned that reputation: three real
bugs found, two of them severe.

**Bug #1 (severe) — shadow mode paused for a human on every detected
challenge.** `worker.js`'s `handleChallenge()` called
`waitForHumanResolution()` unconditionally, with no `task.mode` check — the
same bug SHAPE already found and fixed three times this session (F2's
`internal.js`, F4/F5/F6's `worker.js`), but a more severe INSTANCE of it
here: instead of an immediate fail, this one actually PAUSES for up to
`PAUSE_TIMEOUT_MS` (10 minutes), and with the worker's `concurrency: 1`, a
paused task blocks every other queued task behind it for that whole window.
Combined with F4/F5's finding that CAPTCHA is present on ~100% of real
Lever/Greenhouse postings, an unmodified daily batch of 20-30 shadow-mode
tasks could only make progress with a human live at the console solving
CAPTCHAs one at a time — completely defeating shadow mode's purpose as an
unattended daily process. Fixed: live mode's pause is unchanged and correct
(it genuinely needs a human, per the plan's own "Autonomy... only human
interaction: solving a CAPTCHA" language, which is specifically scoped to a
task that would otherwise really submit); shadow mode now records the
challenge in `fieldsFilled._challengeDetectedPreFill`/`_challengeDetectedPostFill`
instead of pausing.

**Verified with real, live evidence, not just code review**: exported
`runTask()` from `worker.js` and wrote two standalone scripts, mocking only
`backendApi` (the one whole-object import — `resolveAdapter` and the
`browserSession` functions are destructured at require time in `worker.js`
and can't be swapped from outside without `mock.module`, so this was the
practical mocking boundary). Pointed both at hCaptcha's own stable public
demo page (`https://accounts.hcaptcha.com/demo`) rather than a real job
posting, specifically to avoid the posting-closes-mid-session churn F5/F6
both hit — this page reliably has a real CAPTCHA widget and isn't going
anywhere. Shadow-mode script: completed in ~1.7s, `paused_human` never
reported, challenge correctly recorded as metadata. Live-mode script (with
`PAUSE_TIMEOUT_MS_OVERRIDE=3000` so the test doesn't take 10 real minutes):
correctly reported `paused_human`, then correctly failed as `CAPTCHA`/timed-
out once the override window elapsed unresolved, confirming the pause itself
still works exactly as before. Both turned into a permanent test,
`test/shadowModeChallenge.test.js`.

**Bug #2 (severe, different file) — `backend/src/routes/applyBotLive.js`'s
`clientWs` had no `.on('error', ...)` handler**, unlike `upstream` sitting
right next to it with one. Confirmed directly, not assumed: Node's
`EventEmitter` throws synchronously when an `'error'` event fires with zero
registered listeners (`e.emit('error', new Error(...))` on a bare
`EventEmitter` with no listener throws immediately) — and `app.js` has no
process-level `uncaughtException` handler to catch it as a last resort. This
means a single flaky or malformed client WebSocket connection through the
live-view proxy — a dropped network mid-frame, a bad frame, nothing an
attacker even needs to try deliberately — could have thrown an unhandled
exception that crashes the ENTIRE backend Node process, taking down the API
for every user, not just one dropped live-view session. A much larger blast
radius than the feature it was found in. **Reproduced with a real `ws`
WebSocket instance** (a real client connecting to a real local WS server,
`ws.emit('error', ...)` after a genuine handshake): confirmed the old code
shape throws, confirmed the fix (a registered `.on('error', ...)` listener,
symmetric with `upstream`'s) handles the identical event gracefully. Fixed
by adding the missing listener.

**Bug #3 — the F2 mode-check bug, present here too.** This branch predates
the F2 fix, so `internal.js`'s `status === 'submitted' && task.job` check
(the Application-creation branch) still didn't verify `task.mode === 'live'`
— identical to what F2's entry below describes. Not actively triggered under
the current `worker.js` (shadow mode never reports `status: 'submitted'`,
only `shadow_complete`), so this is defense-in-depth rather than a live
exploit path right now, but it's the exact same defect shape found and fixed
twice already this session — worth closing everywhere it appears rather than
trusting every future `worker.js` change to keep respecting an invariant
this file doesn't itself enforce. Re-ran `npm test` after: 44 pass, 1 skip
(no local backend server reachable), 0 fail.

**Also confirmed, not just assumed**: `npx prisma migrate status` on this
branch reports "Database schema is up to date!" — the `pauseReason` column
F7 added is already reconciled onto the shared Neon DB from F1's earlier
migration-drift work, no action needed here.

**Why**: worth explicitly re-checking for the "side-effecting branch missing
a mode/state check" bug shape in every remaining branch (F8-F11) — it's now
been found four separate times (F2, F4/F5/F6 as one shared instance, F7) in
independently-written code, which suggests it's an easy mistake to make in
this specific codebase's shape (worker.js/internal.js's callback-driven,
mode-branching design) rather than a one-off.

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

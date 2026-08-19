# Auto-Apply Bot — Technical Plan (Feature-Numbered)

**Purpose**: a single document that breaks the auto-apply bot initiative into
numbered, independently-scoped features so two people can split work without
stepping on each other. Each feature lists what it is, how to build it (informed by
verified research, not guesses), what it touches, what can go wrong, and what "done"
means.

**How to use this with `MEMORY.md`**: this document defines *scope* and *approach*
per feature — update it when the approach changes (see the Decisions Log in
`MEMORY.md` for the research that already changed F4-F7 once). Day-to-day status
(who's doing what, what's blocked) lives in `MEMORY.md`'s Feature Status Table, not
here — don't let the two drift into duplicating each other.

**Relationship to other docs**: this plan assumes you've read
`docs/apply-bot/README.md`'s status summary. `01-research-plan.md` through
`05-best-practices.md` are referenced inline below rather than repeated.

---

## File Structure — This Is the Complete File Set

**Rule: implement inside these files. Don't create a new file that isn't listed
here.** If a task seems to need one that isn't, that's a signal to add it to this
list first (a one-line addition, with which feature owns it) — not to create it
silently mid-implementation. This is what keeps the file-ownership matrix and
Shared Files rules below actually trustworthy over time; an undocumented new file
is exactly the kind of thing that causes two people to collide without either of
them knowing why.

Three states below: ✅ **built** (real logic, verified per its own feature section),
🏗️ **scaffolded** (2026-08-17 — the file exists with the correct exports, function
signatures, and contract shapes already wired up, but the actual logic is a clearly
marked `// TODO` — fill it in, don't restructure the file), and nothing marked means
**untouched existing file** the feature will edit in place.

```
backend/
├── prisma/
│   └── schema.prisma                     ✅[F1] ApplyCredential, ApplyTask,
│                                               Application.source/resumeId/applyUrl
│                                               🏗️[F14]: EmailIntegration model added,
│                                               commented out — uncomment + migrate
│                                               only once F14 is greenlit for real
├── src/
│   ├── app.js                            (existing — mounts apply-bot routes + internalLimiter)
│   ├── middleware/rateLimiter.js         (existing — apiLimiter/internalLimiter split)
│   ├── routes/
│   │   ├── internal.js                   (existing — apply-bot claim/callback/triggers added)
│   │   ├── applyCredentials.js           ✅[F1] credential CRUD API
│   │   ├── applyTasks.js                 ✅[F2/F9] read-only task list for frontend
│   │   ├── applications.js               (existing — F13's source/resumeId/isGhosted added)
│   │   ├── dashboard.js                  (existing — F9/F13's counts added)
│   │   ├── applyBotLive.js               🏗️[F7] — backend WS proxy to apply-bot's live view
│   │   └── emailIntegration.js           🏗️[F14] — OAuth connect/callback
│   ├── services/
│   │   ├── cryptoService.js              ✅[F1] AES-256-GCM + timingSafeEqualString
│   │   ├── applyBotPlatform.js           ✅[F2] resolvePlatform/requiresCredential
│   │   └── applicationHealth.js          ✅[F13] shared isGhosted()
│   └── queues/
│       └── applyBotQueue.js              ✅[F2] BullMQ Queue only
├── jobs/
│   ├── applyBotSelect.js                 ✅[F2] selection + dedupe + cap + kill switch
│   ├── applyBotSweep.js                  (existing — stale-task cleanup)
│   ├── applyBotFailureReport.js          ✅[F9] — per-adapter success-rate reporting
│   │                                          (filename decision made 2026-08-17;
│   │                                          previously unnamed in this document;
│   │                                          implemented 2026-08-19)
│   └── emailStatusSync.js                🏗️[F14]
├── test/
│   ├── cryptoService.test.js             ✅[F10]
│   ├── applyBotPlatform.test.js          ✅[F10]
│   ├── applyTaskCallback.test.js         🏗️[F10] — skipped until a live DB exists
│   ├── applyBotSweep.test.js             🏗️[F10] — skipped until a live DB exists
│   ├── applyBotSelect.test.js            ✅[F10] — selection safety rules: daily cap,
│   │                                            dedupe, credential requirement, the
│   │                                            F8 generic gate, F8a URL rewrite.
│   │                                            Added to this manifest 2026-08-19
│   │                                            BEFORE the file was created.
│   └── applyBotFailureReport.test.js     ✅[F9] — F9's per-adapter/failure-class
│                                               numbers against seeded fixture rows;
│                                               skipped until a live DB exists.
│                                               Added to this manifest 2026-08-19
│                                               BEFORE the file was created, per the
│                                               rule at the top of this section.
└── apply-bot/                            separate Railway service, see F3
    ├── package.json / Dockerfile / .env.example
    ├── src/
    │   ├── server.js                     ✅[F3] entry point, graceful shutdown;
    │   │                                       🏗️[F7]: mounts liveView.js's WS upgrade handler
    │   ├── liveView.js                   🏗️[F7] — WS server implementing Contract B's
    │   │                                       server→client half (screenshot loop +
    │   │                                       input relay); own file, not crammed into
    │   │                                       server.js — decision made 2026-08-17
    │   ├── worker.js                     ✅[F3] BullMQ worker, processTask()
    │   ├── logger.js / bullConnection.js ✅[F3] mirrors backend's own
    │   ├── adapters/
    │   │   ├── index.js                  ✅[F3] resolveAdapter() — genericAdapter
    │   │   │                                   registered but inert (F8's own gate
    │   │   │                                   in applyBotSelect.js keeps it unused)
    │   │   ├── greenhouseAdapter.js      ✅[F5]
    │   │   ├── leverAdapter.js           ✅[F4]
    │   │   ├── ashbyAdapter.js           ✅[F6]
    │   │   └── genericAdapter.js         ✅[F8] implemented 2026-08-19, still gated off
    │   ├── engine/
    │   │   ├── fieldTaxonomy.js          ✅[F5/F6/F8] generic field matching
    │   │   ├── captchaDetector.js        (existing — + looksLikeLoginPage; 🏗️[F7]: detectEmailVerification stub added)
    │   │   ├── browserSession.js         ✅[F3] launch/close/retry
    │   │   └── ssrfGuard.js              (existing — security hardening pass)
    │   └── services/
    │       ├── backendApi.js             ✅[F3] claim/report with retry
    │       └── storageService.js         ✅[F3] R2 screenshot upload
    └── test/
        ├── ssrfGuard.test.js             ✅[F10]
        ├── adapters.test.js              ✅[F10]
        ├── fieldTaxonomy.test.js         🏗️[F10] — skipped until Playwright is installed
        └── captchaDetector.test.js       🏗️[F10] — skipped until Playwright is installed

frontend/src/
├── api/applyBot.js                       ✅[F11] task/credential API client
├── lib/liveViewProtocol.js               ✅[F11] Contract B message build/parse +
│                                               0..1 pointer normalization, kept as
│                                               pure functions so they are testable
│                                               without a DOM. Added to this manifest
│                                               2026-08-19 BEFORE the file was created.
├── constants/applyTaskStatus.js          ✅[F9]
├── hooks/useApplyTasks.js                ✅[F9]
├── theme/statusColors.js                 (existing — getApplyTaskStatusColor added)
├── components/
│   ├── ApplyTaskRow.jsx                  ✅[F9]
│   ├── ApplyTaskStatusPill.jsx           ✅[F9]
│   ├── CoverLetterModal.jsx              (existing — F13's "Mark as Applied" added)
│   ├── ApplicationRow.jsx                (existing — F13's source/ghosted badges added)
│   ├── SchedulerAlert.jsx                (existing — F9's apply-bot health added)
│   └── ApplyBotLiveView.jsx              ✅[F11] — Contract B client, wired into AutoApply.jsx 2026-08-19
├── pages/
│   ├── AutoApply.jsx                     ✅[F9] read-only task list page
│   ├── Dashboard.jsx                     (existing — F9/F13 wiring added)
│   └── Settings.jsx                      (existing — 🏗️[F11]: credential CRUD
│                                                section added, form fields TODO)
└── (no new page for F11 — the credential form lives inside Settings.jsx per above)

frontend/test/
└── liveViewProtocol.test.js              ✅[F11/F10] — Contract B conformance.
                                                Runs on Node's built-in runner
                                                (`npm test` in frontend/), zero new
                                                dependencies, same approach as the
                                                backend. Added to this manifest
                                                2026-08-19 BEFORE the file existed.

docs/apply-bot/
├── README.md, TECHNICAL_PLAN.md (this document), TEST_PLAN.md
└── 01-research-plan.md, 02-known-issues-and-fixes.md,
    03-failure-measurement.md, 04-confidence-and-filter-tuning.md,
    05-best-practices.md

MEMORY.md                                 (repo root — not inside docs/apply-bot/)
```

**Reading the 🏗️ scaffolded entries**: each one already has a full spec in its
owning feature's section below (exact responsibilities, technical approach, risks)
— the file itself now also has that spec restated as inline comments plus
`// TODO` markers at exactly the points needing real logic, so starting that
feature means opening the file and filling in the marked gaps, not designing the
shape from scratch. None of these are wired into the running app yet (not mounted
in `app.js`, not enabled by env vars) — they exist as complete, correct skeletons
that do nothing until their feature is actually implemented and turned on.

---

## Dependency Graph & Parallel-Safety Matrix

The previous version of this section only said which features *could* be worked in
sequence — it didn't check whether two features touch the same file, which is the
actual thing that causes two people to collide. This version does that check
explicitly, feature by feature, and resolves every real conflict either by declaring
a fixed **contract** (below) that both sides build against independently, or by a
coordination rule.

**Read this as**: rows are features, columns are files. A cell marked means that
feature edits that file. Any column with 2+ marks is a place two people *can*
collide if they don't either (a) work in different waves, or (b) build against a
contract instead of each other's code.

> **Correction, 2026-08-17 (same day, caught before any F4 code was written)**: this
> matrix originally treated F4 as an API-based Lever adapter that *defines* Contract
> A. That premise was wrong — see `MEMORY.md`'s correction entry. Lever's apply
> endpoint requires an employer-owned API key too, same as Greenhouse and Ashby.
> F4 is now browser-automation, on equal footing with F5/F6, and Contract A
> currently has **no real consumer** — kept specified below in case a genuinely
> public apply API turns up in a future source (most likely candidate: F8), not
> built ahead of an actual need.

| File | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `schema.prisma` | ✅ | | | | | | ⚠️(new field) | | | | |
| `internal.js` (backend) | | ✅ | | | | | ⚠️(callback shape) | | | | |
| `applyBotSelect.js` | | ✅ | | | | | | ⚠️(gate check) | | | |
| `apply-bot/src/worker.js` | | | ✅ | | | | ⚠️(pause/resume) | | | | |
| `adapters/index.js` | | | | ⚠️ | ⚠️ | ⚠️ | | ⚠️ | | | |
| `leverAdapter.js` | | | | ✅ | | | ⚠️(reads captcha result) | | | (fixture source) | |
| `greenhouseAdapter.js` | | | | | ✅ | | ⚠️(reads captcha result) | | | (fixture source) | |
| `ashbyAdapter.js` | | | | | | ✅ | ⚠️(reads captcha result) | | | (fixture source) | |
| `fieldTaxonomy.js` | | | | ⚠️(fallback use) | ⚠️(fallback use) | ⚠️(heavy use) | | ⚠️(core engine) | | (test subject) | |
| `captchaDetector.js` | | | | (read-only use) | (read-only use) | (read-only use) | ⚠️(adds email-verify check) | | | | |
| apply-bot WS server / backend WS proxy (new) | | | | | | | ✅ | | | | ⚠️(contract B) |
| `ApplyBotLiveView.jsx` (new) | | | | | | | | | | | ✅ |
| Settings-page credential form (new) | | | | | | | | | | | ✅ |
| `03`'s queries → reporting script (new) | | | | | | | | | ✅ | | |

✅ = the feature "owns" this file (safe to edit freely). ⚠️ = touches a file another
feature also touches — resolved below, not a blocker if you follow the resolution.

### Waves — what can literally start today, in parallel, with zero coordination

**Wave 1 — fully independent, start immediately, any combination of two people:**
- **F10** (testing harness) — new test files only, touches nothing another feature
  owns. Start this first regardless of who does what else; it protects everything
  built afterward.
- **F9** (failure measurement) — new reporting script only.
- **F11's credential-management half** (Settings-page CRUD form) — new frontend
  files, talks only to the already-built `applyCredentials.js` API. Zero overlap
  with anyone.

**Wave 2 — starts after F3, otherwise independent of each other:**
- **F4** (Lever), **F5** (Greenhouse), **F6** (Ashby) — three-way fully parallel
  (each owns its own adapter file), the natural three-person split if the team ever
  grows past two. Each should land its `fieldTaxonomy.js` synonym additions as
  small, additive commits (see Shared Files rule below) rather than long-lived
  branches that all rewrite the same section.
- **F7's backend half** (WS server, `worker.js` pause/resume, schema `pauseReason`
  field, `captchaDetector.js` email-verification check) — benefits from at least
  one of F4/F5/F6 existing to test against (there's nothing to pause without a real
  CAPTCHA-hitting adapter), but does **not** need to wait for all three.

**Wave 3 — genuinely needs another piece to be usable, but can still be *built* in
parallel against a contract:**
- **F11's live-view half** (`ApplyBotLiveView.jsx`) — needs Contract B (below) to
  build against. Once that contract is written (it already is, in this document),
  this can be built and tested with a fake/mock WS server *before* F7's real backend
  exists — the two don't need to wait on each other, they need to agree on the
  contract once.
- **F8** (generic engine) — gated off regardless; sequence after F4/F5/F6 stabilize
  `fieldTaxonomy.js` so it's not rewriting a file mid-tune by someone else.
- **F12** — not a build task, a checklist; blocked on F4/F5/F6/F9/F10 by definition
  (see F12 below), not something to parallelize.

### Direct answer to "if I do F4 and my teammate does F8, does it affect anything?"

No real conflict — F4 (`leverAdapter.js`) and F8 (`fieldTaxonomy.js`'s core engine,
`adapters/index.js`'s generic fallback) share only `fieldTaxonomy.js`, and only for
F4's secondary-field fallback (phone/LinkedIn/portfolio), which is additive-only per
the Shared Files rule below — safe to run in parallel. The pairs that **do** need
the rules below are: F4/F5/F6 all touching `fieldTaxonomy.js` (additive-only keeps
this low-risk), and F7+F11 (split across the live-view protocol boundary).

---

## Shared Files — Coordination Rules

For every ⚠️ cell in the matrix above:

- **`worker.js` (F3 owns it as built; F7 extends it)**: F7 adds the pause/resume
  logic inside the existing (browser-only, currently the only kind) task flow, not
  a restructure. Contract A's `usesBrowser` branch is NOT currently in `worker.js`
  — don't add it speculatively; F4/F5/F6 are all browser-based, so there's nothing
  to branch on yet.
- **`fieldTaxonomy.js` (F4, F5, F6, F8)**: only ever *append* new entries to
  `SYNONYMS` — never reorder or restructure existing entries in the same commit as
  adding new ones. Additive-only changes to a list rarely conflict in git even when
  multiple people edit the same file the same day. Announce non-additive changes
  (e.g. changing `MIN_CONFIDENCE_TO_FILL` or `scoreFieldForKey`'s logic) in
  `MEMORY.md` before making them, since F8 in particular depends on this file's
  behavior staying predictable while it's being built against.
- **`captchaDetector.js` (F5/F6 read-only, F7 extends)**: F7's email-verification
  check should be a new exported function (`detectEmailVerification`) alongside the
  existing `detectCaptcha`, not a rewrite of it — F5/F6 already call `detectCaptcha`
  and shouldn't need to change when F7 lands.
- **`schema.prisma` (F1 done, F7 adds one field)**: schema migrations don't merge
  cleanly if two people run `prisma migrate dev` against diverging schemas at the
  same time. Whoever needs a schema change (currently only F7, for `pauseReason`)
  announces it in `MEMORY.md` *before* running the migration, the other person pulls
  and re-runs `npx prisma generate` before continuing their own work. Treat schema
  changes as a hard serialization point, not something to parallelize.
- **`internal.js` (F2 done, F7 extends the callback shape)**: F7 adding
  `pauseReason` to the callback payload should be an additive field on the existing
  Zod schema (`callbackSchema` in `internal.js`), not a restructure — anything F2's
  original shape already returns should keep working.
- **`adapters/index.js` (F4/F5/F6 already list their adapters; F8 adds one more)**:
  this file is just a list of `{ matches, adapter }` pairs — each feature appends
  one line. Effectively conflict-free even without a rule, but land small commits
  here rather than batching with unrelated changes, to keep merges trivial.

---

## Interface Contracts

Two places in this feature genuinely need two people to build against *each other's
not-yet-written code*. The fix is the same in both cases: write the contract down
once, and both sides build against the contract, not against each other.

### Contract A — Adapter Execution Contract (specified, currently no consumer)

**Status correction, 2026-08-17**: this was originally written for F4 as an
API-based Lever adapter. That premise turned out to be wrong (Lever's apply
endpoint also needs an employer-owned API key — see `MEMORY.md`) — F4, F5, and F6
are all browser-automation adapters, so nothing in the plan currently produces a
`usesBrowser: false` adapter. Left specified below, unbuilt, in case a source with
a genuinely public, unauthenticated apply endpoint turns up later (most plausible
via F8's generic engine touching some smaller job board that never gated automated
submission the way the major ATS platforms do) — worth having the shape agreed on
in advance rather than retrofitting `worker.js` again if that happens. Don't build
the `usesBrowser: false` branch in `worker.js` speculatively; add it only when a
real adapter needs it.

```js
// Browser-based adapter (Lever, Greenhouse, Ashby — all three, currently) — usesBrowser: true
{
  platform: 'greenhouse',
  usesBrowser: true,
  matches(applyUrl) => boolean,
  login(page, credential) => { attempted: boolean },
  fillApplication(page, profile) => { fieldsFilled: object, confidence: number },
  locateSubmit(page) => Locator,
  detectCaptcha(page) => { detected: boolean, strategy?: string },
}

// API-based adapter (no current example) — usesBrowser: false, no Playwright page at all
{
  platform: 'some-future-source',
  usesBrowser: false,
  matches(applyUrl) => boolean,
  submitApplication(profile, credential) => {
    fieldsFilled: object, confidence: number, submitted: boolean, rawResponse?: object,
  },
}
```

If/when a `usesBrowser: false` adapter is ever built, `worker.js`'s `processTask()`
would branch once, at the top:
```js
if (adapter.usesBrowser) {
  // existing launchSession → login → detectCaptcha → fillApplication → submit flow
} else {
  // no browser at all — just: const result = await adapter.submitApplication(profile, task.credential);
  // then report the result via the same backendApi.reportResult() call
}
```

### Contract B — Live-View WebSocket Protocol (F7 backend implements, F11 frontend consumes)

Both sides can build against this today without the other existing yet — F11 stubs
a fake WS server that plays back fixture frames, F7 tests its real server with any
generic WS client script.

**Server → client messages** (apply-bot → backend proxy → frontend):
```js
{ type: 'frame', taskId, image: 'data:image/jpeg;base64,...', width, height, timestamp }
{ type: 'pause', taskId, pauseReason: 'captcha' | 'email_verification' | 'unknown_challenge', instructions: string }
{ type: 'resumed', taskId }
{ type: 'closed', taskId }
```

**Client → server messages** (frontend → backend proxy → apply-bot):
```js
{ type: 'mouse', taskId, action: 'move'|'down'|'up'|'click'|'dblclick'|'wheel', x, y }  // x,y normalized 0..1
{ type: 'keyboard', taskId, action: 'type'|'down'|'up', text?, key? }
{ type: 'mark-resolved', taskId }  // human says "I solved it, continue"
```

`pauseReason` is what makes the frontend show the right instructions ("solve the
CAPTCHA" vs. "check your email for a code and enter it") — this is why F7's schema
addition (`ApplyTask.pauseReason`) and this WS message field must use the same three
string values; keep them in sync explicitly, don't let one become a superset of the
other.

---

## Security Findings & Fixes (researched and applied, 2026-08-17)

A dedicated security pass over this plan, because the feature's attack surface is
real: external, partly-scraped URLs get fed straight into a real browser, secrets
are stored encrypted, and two services talk to each other over an internal API. Each
finding below was researched against current sources before being trusted, and the
concrete, actionable ones were fixed immediately rather than left as a TODO.

### Fixed

**1. SSRF via `applyUrl` — the browser will navigate anywhere it's told, including
internal/cloud-metadata addresses, and no npm SSRF-filter package protects against
this.** `Job.applyUrl` comes from ~13 external fetch sources, several scraped — not
trusted input. Confirmed via research that headless-browser navigation to
attacker-supplied URLs is a known, real SSRF class (full-page-read against cloud
metadata endpoints is the textbook version of this attack), and — critically —
that dedicated SSRF-prevention npm packages (`ssrf-req-filter`,
`request-filtering-agent`) wrap Node's `http.Agent` and give **zero** protection to
Playwright's `page.goto()`, since the browser doesn't route through Node's HTTP
stack at all. Also found a live example (`request-filtering-agent` CVE-2025-57814)
of exactly this class of filter having a real bypass, which argues against trusting
any single library blindly even where it would apply.
**Fix**: `backend/apply-bot/src/engine/ssrfGuard.js` — a hand-rolled guard using
Playwright's `context.route('**/*', ...)` to intercept every request the browser
makes (not just the initial navigation — every redirect and in-page fetch too),
resolve the destination hostname, and abort if it resolves to a private/loopback/
link-local/CGNAT/metadata address (IPv4 and IPv6, including the IPv4-mapped-IPv6
bypass pattern seen in real advisories). Wired into every session in
`browserSession.js`, not just future generic-engine sessions — defense in depth now,
load-bearing once F8 ships. **Verified**, not just written: unit-tested against 18
known IP addresses (metadata endpoint, RFC1918 boundaries, loopback, CGNAT, public
IPv4/IPv6, and the mapped-IPv6 bypass case) — all passed. See the file's own
comments for the documented residual risk (a fast DNS-rebind between the check and
Chromium's actual connect isn't fully closable from application code alone).

**2. Timing side-channel on the internal API secret comparison.** `internal.js`'s
`requireCronSecret`/`requireApplyBotSecret` used `!==` string comparison, which
short-circuits on the first mismatched byte — a textbook timing side-channel that
can leak a secret one byte at a time given enough requests. **Fix**:
`cryptoService.timingSafeEqualString()` — hashes both sides to a fixed-length SHA-256
digest first (avoiding `crypto.timingSafeEqual`'s own throw-on-length-mismatch,
which would otherwise leak length via the exception path) then compares in constant
time. Verified against same/different/mismatched-length/undefined inputs.

**3. No ceiling on total task duration — a single hung page could stall the whole
queue indefinitely.** Individual Playwright calls already had their own timeouts,
but nothing bounded the task as a whole, and `concurrency: 1` means one stuck task
blocks every other queued task behind it. **Fix**: `TASK_DEADLINE_MS` (3 minutes) in
`worker.js` — `processTask()` now races the actual work against a deadline that
force-closes the browser session and reports a `TIMEOUT` failure if exceeded,
freeing the queue.

**4. Internal service-to-service traffic shared a rate-limit bucket with public user
traffic.** The general `apiLimiter` (100 req/min, IP-keyed) applied to
`/api/internal/*` too — a burst of legitimate public API usage from the same egress
IP could 429 the apply-bot service's own claim/callback calls, a self-inflicted
availability bug. **Fix**: `apiLimiter` now skips `/internal` paths;
`/api/internal/*` gets its own `internalLimiter` (300 req/min) — still present as a
circuit breaker against a runaway internal retry loop, just not sharing a bucket
with the public surface.

### Documented, not code-fixed (already covered elsewhere, or correctly deferred)

- **Master key single point of failure, no rotation runbook.** `keyVersion` exists
  on `ApplyCredential` for future rotation support, but no rotation logic is
  implemented. Already flagged in `docs/apply-bot/05-best-practices.md`; still open.
- **Password-like fields are never stored in `fieldsFilled`, by construction, not by
  a redaction step.** Reviewed: `fieldTaxonomy.js`'s taxonomy has no `password` key,
  so `bestMatch()` can never target one for filling, and unmapped-field entries only
  ever record the field's label, never its value. No fix needed — confirming this
  holds is the point of calling it out here rather than assuming.
- **DNS-rebinding residual risk on the SSRF guard** — documented directly in
  `ssrfGuard.js`'s comments rather than repeated here. Not fully closable from
  application code; would need network-level egress controls to fully eliminate.

---

## Reliability Hardening (researched and applied, 2026-08-17)

A second pass, this time asking "assuming nothing is attacking us, what makes this
system fail more than it should, or fail in a way that's worse than just failing
cleanly?" The goal isn't zero failures — browser automation against third-party
sites will always fail sometimes — it's that a failure resolves itself into a clear,
safe, understood state instead of an ambiguous one, and that the *common* case is
success. Six real gaps found; five fixed now, one specified precisely for F7 to
implement since the code it applies to doesn't exist yet.

### Fixed

**1. A crashed apply-bot process left tasks stuck at `running` forever, silently
blocking that job from ever being retried.** Worse: naively marking a stuck task
`failed` (so it could be retried) would risk a genuine duplicate application if the
process actually crashed *after* successfully submitting and *before* reporting
that back — exactly the failure mode `attempts: 1` was built to prevent, reintroduced
through the back door. **Fix**: `backend/jobs/applyBotSweep.js` — a new status,
`unknown_outcome`, distinct from `failed`, set only when a task has been `running`
past a generous threshold (10 min, vs. the in-process 3-min deadline). It's excluded
from `applyBotSelect.js`'s auto-retry logic *indefinitely*, not just for the day —
a human has to check (application history, confirmation email) and resolve it
manually. Wired to run automatically at the start of every selection pass, and
independently testable via a new `POST /api/internal/apply-bot/trigger-sweep`.
Surfaced on the dashboard (see #4 below) so it's never silently sitting there.

**2. No graceful shutdown — a Railway redeploy could kill a task mid-form-fill with
no result ever reported.** **Fix**: `apply-bot/src/server.js` now handles
`SIGTERM`/`SIGINT` by calling `worker.close()` (BullMQ waits for the in-flight job to
actually finish, doesn't kill it) before exiting. **Operational requirement this
depends on, not yet configured anywhere**: the apply-bot Railway service's grace
period between SIGTERM and SIGKILL must be increased beyond Railway's default,
since a task can legitimately take up to `TASK_DEADLINE_MS` (3 minutes) to finish —
set this when the service is actually deployed (F3/F12).

**3. BullMQ's default stalled-job recovery would auto-retry a task after a crash —
reintroducing the same duplicate-application risk as #1, through a different
mechanism.** **Fix**: `maxStalledCount: 0` on the apply-bot `Worker` config,
explicitly disabling that default. A crashed task is caught by the sweep (#1)
instead, which routes it to human review rather than a silent automatic re-run.

**4. No visibility if the whole apply-bot pipeline goes quiet, or if tasks are
piling up in `unknown_outcome`.** The existing `SchedulerAlert.jsx`/`daily-job-fetch`
staleness-alert pattern already solved this for the job-fetch pipeline — it just
hadn't been extended to apply-bot. **Fix**: `backend/src/routes/dashboard.js` now
also returns `schedulerLog.applyBotLastRunAt` (only alarms once the feature has
actually run once, so teams that haven't enabled it yet see nothing) and
`applyBotNeedsReview` (the live `unknown_outcome` count). `SchedulerAlert.jsx`
renders both alongside the existing job-fetch banner.

**5. Adapters had no way to notice they'd landed on a login page instead of the
application form** (most likely cause: an expired reused `sessionState`) — they'd
proceed straight to `fillApplication()` and either abstain with a confusing
`LOW_CONFIDENCE` reason or partially fill the wrong fields. **Fix**:
`captchaDetector.js`'s new `looksLikeLoginPage()` — a generic, adapter-agnostic
heuristic (password field present + no file-upload field present = login page, not
an application form), checked in `worker.js` right after `adapter.login()` and
before `fillApplication()`. Reports a clear `AUTH` failure instead of a confusing
one.

**6. `backendApi.js`'s calls to the backend had no retry, so any transient network
blip between the two Railway services failed the whole task outright** — a
needlessly fragile failure for two services on (presumably) the same private
network. **Fix**: a small bounded retry (`RETRY_DELAYS_MS`) in `backendApi.js`. This
retry is only safe because of the idempotency guard below — worth reading together,
not as two unrelated changes.
  - **Companion fix, load-bearing for #6's safety**: `internal.js`'s callback
    handler now refuses to change a task that's already in a terminal status
    (`TERMINAL_STATUSES` guard). Without this, a retried callback after a dropped
    response — the real scenario #6's retry is meant to recover from — would
    re-run the state-changing logic a second time: a duplicate `submitted` callback
    would create a *second* `Application` row for the same job, and a stale
    `failed` retry arriving late could downgrade a real success into a false
    failure.

### Specified for F7 (can't fix yet — the code doesn't exist)

**7. `TASK_DEADLINE_MS` (3 minutes) will incorrectly kill a legitimately-paused
CAPTCHA task the moment F7 introduces the `paused_human` state.** The 3-minute
deadline was designed for "is this task hung," not "is this task waiting on a human
who hasn't looked at their screen yet" — those need very different timeouts.
**Required design point for F7, not optional**: `processTask()`'s deadline race
must be paused (or replaced with a separate, much longer deadline — the original
plan's §4 already specified 10 minutes for an unsolved CAPTCHA) the moment a task
enters `paused_human`, and resumed/reset when it exits that state. Get this wrong
and F7's first real CAPTCHA pause will be silently killed by unrelated code before
a human ever sees the live view.

---

## F1 — Data Model & Credential Encryption

**Status**: built, not yet run against a live database.
**Depends on**: nothing. **Shares files with**: F7 (adds `pauseReason` to the schema
later — see Shared Files rules above; not a concern for F1 itself).

**What it is**: the `ApplyCredential` and `ApplyTask` Prisma models, plus
`Application.applyUrl`, plus `backend/src/services/cryptoService.js`'s AES-256-GCM
envelope encryption for stored credentials and session state.

**Files**: `backend/prisma/schema.prisma`, `backend/src/services/cryptoService.js`,
`backend/src/routes/applyCredentials.js`.

**Risks**:
- Migration untested against a real Postgres instance — could fail on constraints
  that only surface at migration time (see `docs/apply-bot/02` §1).
- `sessionStateIv`/`sessionStateAuthTag` are deliberately separate from the
  credential's own `iv`/`authTag` (GCM auth tags aren't interchangeable across
  ciphertexts) — if anyone "simplifies" this later by reusing one pair, decryption
  will fail loudly (an auth-tag mismatch throws), which is at least a safe failure
  mode, not a silent one.

**Definition of done**: `npx prisma migrate dev` runs clean against a real DB;
`PUT /api/apply-credentials/:platform` → `GET /api/apply-credentials` round-trips
without ever exposing ciphertext or plaintext secrets in the response (see
`docs/apply-bot/02` §5 for the manual test steps).

---

## F2 — Backend Orchestration API

**Status**: built, never received a real request.
**Depends on**: F1. **Shares files with**: F7 (extends the callback Zod schema in
`internal.js` — additive only, per Shared Files rules), F8 (adds its gate check
inside `applyBotSelect.js` — one `if` branch, low conflict risk).

**What it is**: `backend/jobs/applyBotSelect.js` (selection: cap, dedupe, kill
switch, platform gating) and the `/api/internal/apply-bot/*` routes in
`backend/src/routes/internal.js` (task claim, result callback).

**Files**: `backend/jobs/applyBotSelect.js`, `backend/src/routes/internal.js`,
`backend/src/queues/applyBotQueue.js`, `backend/src/services/applyBotPlatform.js`,
`backend/src/services/cryptoService.js` (timing-safe secret comparison, fixed
2026-08-17 — see Security Findings above), `backend/src/middleware/rateLimiter.js`
+ `backend/src/app.js` (internal traffic split into its own rate limiter, same date),
`backend/jobs/applyBotSweep.js` (stale-task sweep, new file, same date — see
Reliability Hardening above), `backend/src/routes/dashboard.js` +
`frontend/src/components/SchedulerAlert.jsx` (apply-bot health surfaced on the
dashboard, same date).

**Risks**: see `docs/apply-bot/02` §5 and §8. The biggest untested assumption:
that the claim endpoint's `applicant` payload (fullName/email/resume download URL)
is actually sufficient for an adapter to fill a real form — F5/F6 work will surface
gaps here fast (e.g. the missing phone/LinkedIn fields, `docs/apply-bot/01` §D).

**Definition of done**: a manually-triggered `POST /api/internal/apply-bot/trigger-select`
creates real `ApplyTask` rows for a real user with real `JobMatch` data, respecting
the daily cap and dedupe rules — verified by inspecting the created rows, not just by
the endpoint returning 200.

---

## F3 — apply-bot Service Scaffold & Worker Runtime

**Status**: built, dependencies never installed, never executed.
**Depends on**: F1, F2. **Shares files with**: F7 (extends `worker.js`'s
`processTask()` with pause/resume logic). Whoever does F3-level bug fixes here
should keep `processTask()`'s shape stable, since F7 builds directly on top of it.

**What it is**: the separate `backend/apply-bot/` Railway service — Express health
check, BullMQ worker (`concurrency: 1`), the browser session lifecycle helper
(`browserSession.js`, including the bounded micro-retry adopted from the ProBot
reference), and `backendApi.js` (the only way this service talks to the backend).

**Files**: `backend/apply-bot/` (whole directory), especially `src/server.js`,
`src/worker.js`, `src/engine/browserSession.js`, `src/engine/ssrfGuard.js` (SSRF
guard + task deadline, added 2026-08-17 — see Security Findings above).

**Risks**:
- Playwright version pin (`1.49.1`) is stale — see the 2026-08-17 Decisions Log entry
  in `MEMORY.md`. **Fix before relying on this for F5/F6 testing**: bump
  `backend/apply-bot/package.json`'s `playwright` dependency to a current stable
  (≈1.62.x as of this research; check `npx playwright --version` after install for
  whatever resolves) and re-run `npx playwright install --with-deps chromium`.
- `node:22-slim` base image + Playwright's `--with-deps` flag should pull all needed
  OS libraries, but this has never actually been built — first real Docker build is
  the first real test.

**Definition of done**: `docker build` succeeds locally; `npm run dev` boots and
`/health` responds; a manually-enqueued `apply-bot-tasks` job gets claimed and at
least reaches `page.goto()` on a real URL (doesn't need to succeed yet — just prove
the pipe works end to end).

---

## F4 — Lever Adapter: Browser Automation + Selector Verification

**Status**: 🟡 built (Phase 1), unverified against real postings.
**Correction, 2026-08-17**: this feature was originally scoped as an API-based
integration against Lever's Postings API. That was wrong — confirmed by fetching
Lever's actual `postings-api` README directly: the apply endpoint is
`POST /v0/postings/SITE/POSTING-ID?key=APIKEY`, and per Lever's own docs, **"An API
key generated by a Super Admin from the integrations settings page is required."**
That's the employer's own Lever account credential, not something an outside
job-seeker's bot can obtain — the same dead end already found for Greenhouse and
Ashby (see `MEMORY.md`'s correction entry for the full story). What's actually
public/unauthenticated is only the *read* side of the Postings API (listing jobs),
not the apply endpoint — a distinction the earlier research pass missed. F4 is now
on identical footing to F5/F6: browser automation via the already-built
`leverAdapter.js`, verified the same way.
**Depends on**: F3. **Wave 2 — fully parallel with F5 and F6, no coordination
needed between them.** **Shares files with**: F5/F6/F8 via `fieldTaxonomy.js`
(additive-only rule applies); F7 reads this adapter's `detectCaptcha()` output but
doesn't need to wait for F4 to be "finished," just to exist.

**What it is**: verifying and fixing `leverAdapter.js`'s selectors against real
postings — same task as F5/F6, applied to Lever.

**Technical approach**:
1. Find 3-5 real, currently-open `jobs.lever.co` postings. Inspect the actual form
   DOM — `leverAdapter.js`'s current selectors (`input[name="name"]`,
   `input[name="email"]`, `input[name="resume"]`) reflect Lever's documented
   *field-naming conventions for their application-form configuration UI*, not a
   verified live DOM — same unverified-against-a-real-posting caveat as the other
   two adapters, confirm and fix.
2. Lever postings are guest-apply by default (no applicant login exists on most
   boards) — `leverAdapter.js`'s `login()` is already a no-op reflecting this;
   confirm this holds across the real postings tested, adjust only if a gated board
   is found.
3. Resume upload via `input[name="resume"]`, `setInputFiles()` — confirm this
   selector is correct against a real posting; per Lever's own docs the resume
   field only works in `multipart/form-data` mode (irrelevant distinction for
   direct DOM automation, but useful confirmation the field name itself is right).
4. Same hydration-timing question as F5/F6 (`docs/apply-bot/02` §4) — confirm
   whether `leverAdapter.js` needs a `waitForSelector` before fields exist.

**Risks**: same category as F5/F6 — unverified selectors, possible CAPTCHA (not yet
confirmed for Lever specifically, worth recording alongside F6's open question on
Ashby), and the same login-page-detection safety net (`looksLikeLoginPage()`,
already wired in automatically) covers a stale/invalid credential the same way.

**Definition of done**: same bar as F5/F6 — 3+ real postings, correctly filled in
shadow mode, verified against screenshots.

---

## F5 — Greenhouse Adapter: Browser Automation + Selector Verification

**Status**: built, unverified. Confirmed by research that this **must** stay
browser-automation-based (Greenhouse's submit API requires an employer-owned key we
can't obtain — see `MEMORY.md`'s 2026-08-17 entry).
**Depends on**: F3. **Wave 2 — start any time, fully parallel with F6.**
**Shares files with**: F6, F8 via `fieldTaxonomy.js` (additive-only rule applies —
see Shared Files above); F7 reads this adapter's `detectCaptcha()` output but
doesn't need to wait for F5 to be "finished," just to exist.

**What it is**: verifying and fixing `greenhouseAdapter.js`'s selectors against real
postings, and building real handling for Greenhouse's (commonly invisible)
reCAPTCHA.

**Technical approach**:
1. Do `docs/apply-bot/01-research-plan.md` §A's method: find 3-5 real open
   Greenhouse postings, inspect the actual form DOM, fix selectors.
2. **Confirm the hydration-timing question** (`docs/apply-bot/02` §4) — does the
   classic `boards.greenhouse.io` form need a `waitForSelector` before fields exist?
3. **Budget real time for CAPTCHA, don't treat it as an edge case.** Real-world
   evidence (see `MEMORY.md`'s Zapply research entry) says Greenhouse commonly uses
   reCAPTCHA (sometimes invisible, triggered by behavioral signals) and that this is
   the dominant failure mode for automating Greenhouse specifically — expect a
   meaningfully high `failureClass: 'CAPTCHA'` rate in Phase 1 (before F7 ships)
   and treat that as expected, not a sign the adapter is broken.
4. **Do not** attempt to defeat invisible reCAPTCHA with human-mimicry (randomized
   mouse movement, typing delays, proxy rotation) or third-party CAPTCHA-solving
   services — both were tried by a real team building something similar and didn't
   work reliably; see `MEMORY.md`. The correct response to a detected CAPTCHA is
   F7's live-view hand-off, not evasion.

**Risks**: see `docs/apply-bot/02` §3, §4. Additionally: Greenhouse's newer embedded
board format (React-rendered, per one search result) may differ structurally from
the classic server-rendered board — confirm which format each test posting uses.

**Definition of done**: a real form filled correctly (verified against screenshots)
in shadow mode on at least 3 different real Greenhouse postings, with CAPTCHA
correctly detected and classified (not silently mis-filled) when present.

---

## F6 — Ashby Adapter: Browser Automation + Selector Verification

**Status**: built, unverified. Same posture as F5 — Ashby's `applicationForm.submit`
API requires an org-level `candidatesWrite` API key, not obtainable by us.
**Depends on**: F3. **Wave 2 — start any time, fully parallel with F5.**
**Shares files with**: F5, F8 via `fieldTaxonomy.js` (heaviest user of the three —
if you're doing F6, expect to add the most new synonyms; keep additions
append-only, per Shared Files above).

**What it is**: same verification work as F5, applied to `ashbyAdapter.js`.

**Technical approach**: same method as F5 §1-2. CAPTCHA presence on Ashby wasn't
confirmed by research (open question in `MEMORY.md`) — the first real test run
against a live posting answers this. Ashby's form is more dynamically-rendered
(React) per its docs, so the `fieldTaxonomy.js` fallback (already used more heavily
in this adapter than the other two, see the adapter's own file comment) matters more
here — prioritize getting real field-label data from a live posting to check the
`SYNONYMS` list against.

**Risks**: same category as F5, plus higher structural uncertainty since less could
be confirmed about Ashby's exact form DOM from documentation alone (Ashby's docs
focus on the *API* schema, not the public-facing HTML form's structure).

**Definition of done**: same bar as F5 — 3 real postings, correctly filled in shadow
mode, verified against screenshots.

---

## F7 — CAPTCHA / Bot-Challenge Live-View

**Status**: built and verified 2026-08-19 — see MEMORY.md's 2026-08-19 F7 entry and
`docs/apply-bot/TEST_PLAN.md` F7. **Scope is larger than originally planned** — see below.
**Depends on**: at least one of F4/F5/F6 existing to test against (not all three
required). **Shares files with**: `worker.js` (F3 — extend, don't restructure),
`schema.prisma` (F1 — one new field, see the schema serialization rule above),
`internal.js` (F2 — additive callback field), `captchaDetector.js` (F4/F5/F6 — new
sibling function, not a rewrite). **This is the
one feature that should be done by a single person start-to-finish** — its backend
half (this feature) and F11's live-view frontend half are the two sides of Contract
B and can be built in parallel by two *different* people without either waiting, but
F7 itself (WS server + worker pause logic + schema + detector) is tightly coupled
internally and not worth splitting further.

**What it is**: the human-in-the-loop hand-off system. Originally scoped as
CAPTCHA-only; research surfaced a second real challenge type that needs the same
treatment.

**Scope change from the original plan**: real-world evidence shows bot-detection on
these platforms doesn't only manifest as a visual CAPTCHA — it can also trigger an
**email-verification challenge** (a 6-digit code sent to the applicant's email that
must be entered to proceed). This project's `ApplyTask` doesn't have any way to read
the applicant's email inbox, so this can't be solved automatically even in
principle — it needs the same human hand-off pattern as CAPTCHA, not a different
mechanism.

**Technical approach**:
1. Build the screenshot-polling-over-WebSocket live view exactly as designed in the
   plan's §4 (already validated as the right approach, no change there): 1-second
   `page.screenshot({type:'jpeg'})` interval, WS-relayed to an authenticated frontend
   session via the backend proxy (`apply-bot` keeps no public networking), normalized
   mouse/keyboard event relay back into `page.mouse`/`page.keyboard`.
2. **Generalize the pause state.** Rather than a single `paused_captcha` status,
   treat it as `paused_human` with a `pauseReason` field (`'captcha' | 'email_verification' | 'unknown_challenge'`).
   This is a small schema addition (one new column, or reuse `failureClass`'s enum
   pattern) — flag it the same way the other schema changes were flagged, since
   `backend/prisma/CLAUDE.md`'s "explicit instruction" rule still applies.
3. `captchaDetector.js` needs a sibling check for email-verification prompts (text-scan
   for phrases like "check your email", "verification code", "enter the code we sent")
   — same narrow-pattern-matching approach already used for CAPTCHA text detection.
4. The frontend's `ApplyBotLiveView.jsx` (not yet built — see F11, it's the same
   component) needs to show *which* kind of challenge is pending, since "solve the
   CAPTCHA" and "check your email and enter the code" are different instructions for
   the human — see step 5 below for a required piece of this that's easy to miss.
5. **Required, not optional: make `worker.js`'s `TASK_DEADLINE_MS` pause-aware.**
   See "Reliability Hardening" §7 above — the existing 3-minute deadline was built
   before `paused_human` existed and will silently kill a legitimately-paused task
   if F7 doesn't explicitly pause or replace that timer while `status ===
   'paused_human'`, using a separate, much longer deadline (the original plan
   specified 10 minutes for an unsolved CAPTCHA) for that state specifically. This
   is the single most likely way F7 ships with a bug that only shows up the first
   time a real CAPTCHA is hit in production — flagging it here precisely so it
   isn't rediscovered the hard way.
6. `worker.js` already calls `captchaDetector.js`'s `looksLikeLoginPage()` right
   after `adapter.login()` (see "Reliability Hardening" §5 above) — an `AUTH`
   failure with that specific reason means the session/credential was stale, not a
   CAPTCHA or email-verification challenge. Nothing for F7 to build here, just worth
   knowing this failure class exists and is unrelated to this feature's scope.

**Risks**: this is real-time systems work (WebSocket relay, live browser control) —
the highest-complexity single feature in the whole plan, as already flagged. Budget
accordingly; don't treat it as "just wire up a canvas."

**Definition of done**: a real CAPTCHA on a real Greenhouse posting successfully
paused, displayed live, solved by a human, and the task resumed and completed
automatically afterward.

---

## F8 — Generic Engine (Non-ATS Sources)

**Status**: ✅ done and verified 2026-08-19. F8a (platform re-resolution) and F8b
(the `resume_upload` scoring bug) are built and verified against real postings;
`genericAdapter.js` is now implemented rather than scaffolded. F8c is **researched
and deliberately closed without building** — see its subsection below for the
numbers. `APPLY_BOT_GENERIC_ENABLED` stays `false`, which is a conclusion of the
research rather than an unfinished step.
**Depends on**: nothing hard — soft-sequenced after F4/F5/F6 so `fieldTaxonomy.js`
isn't being tuned by four people at once, and so there's real data on which fields
those three adapters' fallback logic already handles well before duplicating effort.
A generic adapter is `usesBrowser: true` like all current adapters (see Contract A's
2026-08-17 correction above — there's no API-based precedent to follow here).
**Shares files with**: `fieldTaxonomy.js` (F4/F5/F6 — additive rule applies),
`adapters/index.js` (one appended line), `applyBotSelect.js` (F2's gate check — one
`if` branch).

**What it is**: extending auto-apply to the ~9 non-ATS sources (Remotive, Adzuna,
Jooble, etc.) using `fieldTaxonomy.js`'s generic field-matching engine.

**Technical approach**: see `docs/apply-bot/01-research-plan.md` §E for the
prerequisite research (build a real test corpus first, don't guess synonyms) and
`docs/apply-bot/04-confidence-and-filter-tuning.md` for the tuning methodology once
real abstain data exists.

**Risks**: this is the lowest-confidence, highest-variance feature in the whole
plan — by definition, it's automating against forms of completely unknown structure.
The abstain rule (never guess on required fields) is the entire safety mechanism
here; do not weaken `MIN_CONFIDENCE_TO_FILL` to make this feature's numbers look
better (see `docs/apply-bot/04`'s explicit warning against this).

**Definition of done** — the scoping pass this section asked for ran 2026-08-19; full
evidence is in `01-research-plan.md` §E ("DONE — findings"). It answered the question
this section left open, and the answer changes what F8 is:

> *"this may turn out to be a much smaller feature than it sounds, or may need a
> resolve-the-real-destination-first step not yet designed"* — **both, as it turns
> out.** Only **1 of 20** real non-ATS `applyUrl`s landed on a directly fillable form.
> Meanwhile **611 of 1088** URLs currently classed `generic` (56%, measured across the
> whole database) are Greenhouse boards on company domains that `resolvePlatform()`
> misses because it only inspects `hostname` and ignores the `gh_jid` query parameter.

So the generic field-matching engine — the thing this feature was named after — is
the **lowest**-value part of the work, and the taxonomy's synonym list is not the
bottleneck (§E Finding 5). F8 splits into three pieces of very unequal value:

**F8a — platform re-resolution (highest value, lowest risk).** Teach
`resolvePlatform()` (and `adapters/index.js`) that a `gh_jid=` parameter means
Greenhouse regardless of hostname, and rewrite the applyUrl to the **embed** form
(`job-boards.greenhouse.io/embed/job_app?for=<company>&token=<gh_jid>`) — *not* the
canonical board URL, which redirects straight back to the company site (§E Finding 2).
Routes 611 jobs to the already-verified F5 adapter, whose `#resume` selector is
confirmed to match on those embed forms (§E Finding 3). **Needs explicit sign-off**:
it moves 611 jobs onto a platform where `requiresCredential()` is true, so any user
without a stored Greenhouse credential goes from "generic, attempted" to "skipped" —
a real behaviour change, not a refactor.

**F8b — the `resume_upload` scoring bug (small, self-contained, pure improvement).**
On 4 of 4 real Greenhouse embed forms the file input is labelled "Attach" and carries
`id="resume"`, but `scoreFieldForKey()` scores an id/name hit at `NAME_ATTR` (35),
under `MIN_CONFIDENCE_TO_FILL` (60) — so the strictest gate in the whole engine (§04)
fails on an unambiguous signal. Note `bestMatch()` already restricts `resume_upload`
candidates to `type === "file"`, which makes an id/name hit *far* stronger evidence
here than the same hit on a text field; the scoring doesn't reflect that. Fixing this
is §04's blessed "case 2" (a real field under an unrecognised label — pure
improvement, no accuracy tradeoff). Careful: these forms have **two** file inputs
(`id="resume"` and `id="cover_letter"`), both labelled "Attach", so a naive
`'attach'` synonym would match the cover-letter input too — which is exactly why the
fix should key off the id/name, not the visible label.

**F8c — the aggregator residual (largest remaining, lowest confidence).** The true
unknown is 477 URLs across exactly 8 aggregator hosts (§E Finding 6), essentially all
listing pages. This is where the "resolve-the-real-destination-first step not yet
designed" actually belongs: follow the page's apply link, then re-resolve the
destination (which may well be a 4th ATS — the one success was a JazzHR board at
`applytojob.com`). Until that step exists, a generic *field-filling* engine has almost
nothing to point at, so **F8c should not start with `fieldTaxonomy.js` tuning.**

**Outcome, 2026-08-19.** F8b and F8a are done and verified; F8a was explicitly
signed off before shipping. `genericAdapter.js`'s TODOs are filled in too, so the
generic engine is correct and safe *when* enabled. `APPLY_BOT_GENERIC_ENABLED` stays
`false` — not as an unfinished step but as the research's conclusion.

**F8c: researched, deliberately not built.** The follow-the-apply-link idea was
probed on 16 real aggregator postings, 2 per host across all 8 hosts. Only **3 of 16
(19%)** reached a fillable form, and **2 of those 3 landed on Greenhouse and Ashby**
— platforms with verified adapters already, i.e. the payoff here is again *routing*,
not generic filling. The third landed on JazzHR (`applytojob.com`), where the
existing synonyms already match every required field; if F8c is ever revived, a small
JazzHR adapter is a better first move than a link-follower.

The failures are structural, not fixable by better heuristics:
- **weworkremotely.com** — "Apply now" leads to *"Create an account to view full
  job"*. A login wall the bot has no account for.
- **remoteok.com** — "Apply" points at a `/l/<id>` tracking gateway that bounced
  straight back to the same page.
- **himalayas.app, mustakbil.com, remotive.com** — **zero** apply anchors on the
  page at all (4 postings, 2 each): the control is scripted or gated, not an `<a>`.

One honest caveat on that 19%: the probe's link-picking heuristic is weak, and it
demonstrably misfired on `arbeitnow.com`, where it followed a blog post titled
*"Applying for German Citizenship"* instead of the real apply control. So the true
ceiling is somewhat above 19% — but the login walls and missing anchors above cap it
well short of anything that would justify the build now.

**If F8c is revived**, the sequence the evidence supports is: (1) a JazzHR adapter,
(2) a link-follower whose *only* job is to re-resolve into an existing adapter, and
(3) generic filling last, if ever.

---

## F9 — Failure Measurement & Alerting

**Status**: ✅ done and verified (2026-08-19). The staleness/needs-review alerting
half landed 2026-08-17 (Reliability Hardening pass); the per-adapter success-rate
reporting half landed 2026-08-19 in `jobs/applyBotFailureReport.js`. All four of
TEST_PLAN's F9 items verified against the real Neon database.
**Depends on**: nothing (reads `ApplyTask` data that F1/F2 already produce).
**Wave 1 — the remaining work can start immediately.** **Shares files with**: none —
new files only.

**What's already done**: `backend/src/routes/dashboard.js` now returns
`schedulerLog.applyBotLastRunAt` and `applyBotNeedsReview` (live count of
`unknown_outcome` tasks); `SchedulerAlert.jsx` renders both alongside the existing
job-fetch staleness banner. This closes the "is the pipeline quiet" and "is
something stuck needing a human" visibility gaps — see "Reliability Hardening" §4.

**What was built for the remaining half (2026-08-19)**: `runApplyBotFailureReport()`
computes §03's §1 overall success rate, §2 abstain rate, §4 failure-class breakdown
and §5 per-adapter success rate over a rolling window (default 7 days) in exactly
two `groupBy` queries — one on `(adapterUsed, status)`, which the overall figures are
derived from rather than re-queried, plus one on `failureClass`. It runs three ways:
automatically at the end of every `applyBotSelect.js` run (on **both** sides of the
kill switch, for the same reason the sweep is unconditional — a team that just
disabled the bot after a bad week is exactly the team that still needs the numbers),
on demand via `node -r dotenv/config jobs/applyBotFailureReport.js [windowDays]`, and
readable after the fact from the `apply-bot-failure-report` `SchedulerLog` rows it
writes (full report JSON in the existing `sourceBreakdown` column — no schema change).

Two deliberate calls worth knowing about:
- A rate with nothing resolved to divide by returns `null`, never `0`. "No data yet"
  and "0% success" are different answers and collapsing them would make the report
  actively misleading — a brand-new adapter would read as a broken one.
- §03's ">50% per-adapter failure rate" alert is a `logger.warn`, guarded by a
  20-resolved-task minimum, **not** a dashboard banner — §03 itself says not to build
  alert UI before there's real volume to calibrate thresholds against.

**Still deliberately not built**: §03's §3 CAPTCHA-hit rate, §6 confidence-score
histogram, and §7 cap sanity check — out of scope for F9's stated remaining half
(per-adapter success rate + failure-class breakdown), and each needs its own query
rather than falling out of the two above for free. §3 is the most likely next
addition, since it's the before/after metric for F7's live-view work.

**Risks**: low — this is straightforward reporting work, mostly bounded by how much
real `ApplyTask` data exists to report on.

**Definition of done**: after a batch of F5/F6 test runs, someone can answer "what's
our Greenhouse success rate this week" without hand-writing a Prisma query each time.
**Met 2026-08-19** — `node -r dotenv/config jobs/applyBotFailureReport.js 7` against
the real database answered exactly that question (`greenhouse 22.2% (2/9)`,
`lever 0% (0/3)`, failure classes `TIMEOUT: 3, CAPTCHA: 3`) with no query written by
hand.

---

## F10 — Testing & Verification Harness

**Status**: ✅ done and verified 2026-08-19. Every item below is built and running:
**78 passing / 0 skipped / 0 failing in 48s** with a live `DATABASE_URL`, and 57
passing / 8 skipped / 0 failing without one. Still zero new dependencies — Node's
built-in runner throughout.

Three things closed the remaining gaps: Playwright is actually installed now (item 3),
the callback test starts its own server instead of requiring one (item 4), and
`applyBotSelect.js` — which a coverage run exposed at **16.98%** — got a real suite.

**Coverage**, via `npm run test:coverage` (`--experimental-test-coverage`):

| Area | line % | branch % |
|---|---|---|
| `applyBotPlatform.js` | 97.80 | 96.30 |
| `genericAdapter.js` | 97.12 | 75.86 |
| `applyBotFailureReport.js` | 89.41 | 84.00 |
| `applyBotSweep.js` | 87.50 | 80.00 |
| `ssrfGuard.js` | 86.18 | 88.24 |
| `fieldTaxonomy.js` | 77.78 | 85.71 |
| `applyBotSelect.js` | 69.75 (was 16.98) | 100.00 |
| `internal.js` | 65.41 | 60.00 |
| **whole backend** | **59.20** | **82.49** |

The whole-backend line figure is worth reading carefully rather than as a grade: the
apply-bot feature files above are all 65-98%, and the number is dragged down by
pre-existing code **outside this feature** that has never had tests — `jobFetcher.js`
(27%), `matchingEngine.js` (36%), `storageService.js` (42%), `dailyJobFetch.js` (17%).
Raising those is real work, but it is not F10, and padding this feature's tests would
not move it either.

Deliberately still uncovered inside the feature: `runApplyBotSelection()`'s
all-users loop (tests target `selectForUser` instead, since looping every user in a
shared database is not something a test may do), and the adapters' browser-driving
halves, which need a live posting rather than a fixture.
**Depends on**: nothing to *start* (crypto/platform-resolution tests need only F1/F2,
already built). **Wave 1 — start immediately, ideally before anything else.**
**Shares files with**: none directly — test files only, read the adapter files as
fixtures but never modify them. Safe to run alongside literally any other feature.

**What it is**: the minimum test coverage needed to catch regressions as Track A
changes adapters and Track B changes infrastructure.

**Technical approach**, in priority order:
1. ✅ **Done** — `cryptoService.js` encrypt→decrypt round-trip (including the JSON
   variants), plus a tampered-ciphertext test and a wrong-iv/authTag test (the exact
   bug class this session caught and fixed for the sessionState fields). See
   `backend/test/cryptoService.test.js`.
2. ✅ **Done** — `applyBotPlatform.js`'s `resolvePlatform()`/`requiresCredential()`
   against real URLs found during this session's research (real Greenhouse/Lever
   postings, not made-up examples). See `backend/test/applyBotPlatform.test.js`.
3. 🔴 **Still open, needs a real browser** — `fieldTaxonomy.js`'s `bestMatch()`
   against a small fixture HTML page with known fields — this is what makes F8's
   tuning work (§04) measurable instead of vibes-based. Not buildable without
   Playwright actually installed and a page to scan; `adapters.test.js` covers the
   browser-free URL-matching half of adapter correctness in the meantime.
4. 🔴 **Still open, needs a live database** — an integration smoke test for the
   claim→callback round trip against a test DB (can reuse whatever local Postgres
   setup F1's verification already stood up).
5. **Reliability Hardening pass (2026-08-17) — permanently regression-guard
   everything fixed in that pass:**
   - ✅ **Done** — `ssrfGuard.js`'s `isBlockedIp()` against all 18 known addresses
     (metadata endpoint, RFC1918 boundaries, loopback, CGNAT, public IPv4/IPv6, the
     IPv4-mapped-IPv6 bypass case). See `backend/apply-bot/test/ssrfGuard.test.js`.
   - ✅ **Done** — `cryptoService.timingSafeEqualString()` against same/different/
     mismatched-length/undefined inputs. Same file as item 1.
   - ✅ **Done, bonus** — `adapters/index.js`'s `resolveAdapter()` against real ATS
     URLs, plus an assertion that every currently-registered adapter is
     browser-based (`usesBrowser`-shaped) — this is the test that would catch it
     immediately if Contract A's `usesBrowser: false` branch ever silently
     resurfaces without a real adapter behind it. See
     `backend/apply-bot/test/adapters.test.js`.
   - 🔴 **Still open, needs a live database** — `internal.js`'s callback
     `TERMINAL_STATUSES` guard (assert a duplicate `submitted` callback doesn't
     create a second `Application` row, and a stale `failed` callback can't
     downgrade an already-`submitted` task).
   - 🔴 **Still open, needs a live database** — `applyBotSweep.js`'s staleness
     thresholds.
   - 🔴 **Still open, needs a real browser** — `captchaDetector.js`'s
     `looksLikeLoginPage()` against fixture pages.

**Risks**: none — this is pure upside, the only cost is time not spent on features.
Worth doing in parallel with Track A from day one rather than "after."

**Definition of done**: `npm test` (`node --test`, wired into both
`backend/package.json` and `backend/apply-bot/package.json` — no new dependency)
covers all items above and runs in under a minute. **Met 2026-08-19**: 78 passing,
0 skipped, 0 failing, 48s. Both remaining blockers named in the original wording are
gone — F1's migration is applied and Playwright is installed — and the one test that
needed a hand-started backend now starts its own.

---

## F11 — Credential & Session Management UX

**Status**: ✅ done and verified 2026-08-19. Both halves are built: the Settings
credential CRUD and `ApplyBotLiveView.jsx`, the latter now wired into
`AutoApply.jsx` and talking to F7's real backend rather than a stub.
**Depends on**: nothing for the credential-CRUD half (F1's API already exists —
**Wave 1, start immediately**). The live-view half depends only on Contract B
(above) being read, not on F7's actual backend existing — build against a stubbed
WS server first. **Shares files with**: none — this feature only creates new
frontend files.

**What it is**: two independent pieces worth treating as separate units of work
even though they're grouped under one feature number: (a) a Settings-page section
where a user creates/updates/deletes their per-platform `ApplyCredential` rows —
zero dependency on anything else in this plan, start today — and (b) the
`ApplyBotLiveView.jsx` component for solving a paused challenge, built against
Contract B (above) rather than against F7's real backend.

**Technical approach**: follow the existing `Settings.jsx` conventions (per
`frontend/CLAUDE.md`) for the credential CRUD form (react-hook-form + Zod, matching
the pattern used elsewhere in that file). The live-view canvas component
(`ApplyBotLiveView.jsx`, referenced but not yet built in the original plan's §6) is
scoped here since it's UI work independent of F7's backend/worker pieces — the two
can be built in parallel and wired together once both exist.

**Risks**: low technically; the main risk is UX — showing a user "here's a live
browser controlled by a bot, using your credentials" needs to be legible and not
alarming. Worth a quick design pass, not just a functional canvas element.

**Definition of done**: a user can add a Greenhouse credential through the UI (no
`curl`/Postman needed), see it listed (without ever seeing the secret again, per
F1's existing redaction), and delete it. **Met 2026-08-19**, driven through a real
browser against the built app — 9/9 checks, see TEST_PLAN's F11 section.

**What was built beyond the bare CRUD, and why:**
- `lib/liveViewProtocol.js` — Contract B's message building/parsing and the 0..1
  pointer normalization, pulled out as pure functions. The component around them
  needs a browser and a socket; these do not, and they are the parts that fail
  *silently* rather than loudly. An out-of-range coordinate throws nowhere: the
  apply-bot side simply denormalizes it and clicks off-page.
- `frontend/test/` — the frontend had no test tooling at all, which is why F9's
  `SchedulerAlert` items could only be verified at logic level. Node's built-in
  runner works on this ESM codebase with **zero new dependencies**, so `npm test`
  now exists on both sides of the repo. 16 tests.
- A `size` prop on `ui/Modal` (default unchanged) — a full browser screenshot is
  unreadable at the default dialog width.

**Three real bugs found while wiring this up**, all pre-existing:
1. The frontend still used the pre-F7 status name `paused_captcha` in three places
   (`constants/applyTaskStatus.js`, `theme/statusColors.js`, `hooks/useApplyTasks.js`).
   The backend has written `paused_human` since F7. The damaging one was in the
   polling hook: `ACTIVE_STATUSES` did not contain the real paused status, so the
   moment a task actually needed a human the 5-second refetch **stopped** — exactly
   when the UI most needed to keep looking.
2. `routes/applyTasks.js` never exposed `pauseReason`. F7 added the column; nothing
   surfaced it, so the live-view could not tell "solve a CAPTCHA" from "fetch a code
   from your inbox". Added to `publicTask`.
3. `npm ci` fails outright in `frontend/` — recorded in MEMORY's Open Questions,
   since it blocks deployment rather than this feature.

---

## F12 — Live-Mode Rollout & Safety Ops

**Status**: blocked — this is a checklist/gate, not something to build in isolation.
**Depends on**: F5, F6, F9, F10 (hard gate — see Prerequisites below). **Shares
files with**: none directly — this is an operational process, not a code feature.
This is the feature whose completion means "the system is ready" — see the closing
note at the end of this document.

**What it is**: the actual process of flipping `APPLY_BOT_MODE` from `shadow` to
`live`, safely, per `docs/apply-bot/05-best-practices.md`.

**Prerequisites** (don't start this before all of these are true):
- F4, F5, and F6 have each been shadow-tested against real postings with a success
  rate worth trusting (no fixed number — read the actual `fieldsFilled` audit data
  by hand for at least 20 tasks per adapter before deciding).
- F9 exists in at least its minimal form (§F9's "answer the question without hand-
  writing a query" bar) — you need to be able to see the failure-rate trend before
  trusting live mode. The staleness/needs-review alerting half is already done.
- F10's crypto and platform-resolution tests are green — including the 2026-08-17
  Reliability Hardening additions (item 5 in F10's technical approach): the SSRF
  guard, the callback idempotency guard, and the sweep threshold tests specifically,
  since those are what make live mode's failure modes safe rather than just quiet.
- A kill-switch drill (per `docs/apply-bot/05`) has actually been performed once,
  not just documented as possible.
- **The `apply-bot-select` (and, once F7 lands, the sweep) repeatable BullMQ job is
  actually registered** — mirroring the existing `daily-job-fetch`/
  `exchange-rate-fetch` pattern in `backend/src/workers/schedulerWorker.js`. Phase 1
  only ever manually triggers `applyBotSelect.js`; wiring the real schedule (the
  original plan specified ~05:15 UTC, a few minutes after `daily-job-fetch`) is a
  concrete, easy-to-forget implementation step in its own right, not something that
  happens automatically just because the other features are done.
- **The apply-bot Railway service's SIGTERM→SIGKILL grace period has been increased**
  beyond its default (see "Reliability Hardening" §2) — otherwise the graceful
  shutdown code shipped in F3 can't actually do its job during a deploy.

**Technical approach**: flip one adapter (recommend Greenhouse first, since it's the
best-understood after F5) to live for one user, at a low daily cap (recommend
starting at 5, per `docs/apply-bot/05`), before touching the global default.

**Definition of done**: not a code deliverable — this is "done" when the team has
actually reviewed a week of live submissions and is comfortable raising the cap or
adding a second adapter to live mode.

---

## F13 — Unified Application Tracking (source, resume link, ghosted detection)

**Status**: ✅ Built, 2026-08-17. Prompted by "track all applications" — closing gaps
in the pre-existing manual tracker that predate the auto-apply bot, plus properly
integrating the bot's submissions into the same tracker rather than a parallel one.
**Depends on**: F1 (schema), F2 (bot creates `Application` rows). **Shares files
with**: none currently in progress — safe to build alongside any F4-F12 work.

**What it is**: three real gaps closed together, since they compound —

1. **`Application.applyUrl` never got set for manually-created rows** — always null.
   Now populated from `Job.applyUrl` when applying from a matched job, same as the
   bot's rows.
2. **No way to tell a manual application from a bot-submitted one.** New
   `Application.source` (`'manual' | 'auto_apply_bot'`), set correctly by both
   creation paths (`applications.js`, `internal.js`'s callback).
3. **`ApplyTask.applicationId` existed in the schema from the start but was never
   actually written** — the field was there for exactly this link, just unused. Now
   backfilled the moment the bot creates an `Application`, so a row in the tracker
   can be traced back to its full audit trail (screenshots, confidence score,
   fields filled) instead of an indirect jobId/userId/time match.
4. **The pre-existing "Apply" button gap** (flagged in `JOBHUNT.md` before this
   session even started): clicking Apply on the Jobs page only ever opened the
   cover-letter modal — it never created an `Application` record, meaning manually-
   applied jobs weren't tracked at all unless separately re-entered. Fixed with an
   explicit "Mark as Applied" action in `CoverLetterModal.jsx` — deliberately a
   separate click from generating the cover letter (viewing a cover letter isn't the
   same as having actually applied), matching the spec's "one-click, but a
   deliberate click" mark-as-applied language.
5. **`Application.resumeId`** — which resume version was active at application
   time, set the same way by both creation paths. Answers "which resume did I use
   for this" without guessing from `updatedAt` timestamps.
6. **"Ghosted" detection** — a computed (never stored) flag per common job-tracker
   convention: 14 days of silence right after applying, or 10 days after the last
   stage change, with terminal outcomes (offer/rejected/withdrawn) never eligible.
   One shared implementation (`backend/src/services/applicationHealth.js`) used by
   both the per-row flag (`applications.js`) and the dashboard's aggregate count
   (`dashboard.js`) — deliberately factored out after almost landing as two copies
   of the same threshold logic, which would have drifted apart the first time
   either one was tuned.

**Files**: `backend/prisma/schema.prisma`, `backend/src/routes/applications.js`,
`backend/src/routes/internal.js`, `backend/src/routes/dashboard.js`,
`backend/src/services/applicationHealth.js` (new),
`frontend/src/components/CoverLetterModal.jsx`,
`frontend/src/components/ApplicationRow.jsx`.

**Verified**: syntax-checked, Prisma schema validated, frontend rebuilt clean — not
yet exercised against a live database (same limitation as F1-F3: no local
Postgres/Redis in the session that built this).

**Definition of done**: already met for what's in scope here — remaining
verification is the same as F1's (run the migration, exercise for real).

---

## F14 — Email-Based Application Status Auto-Detection (researched, not built)

**Status**: 🔵 Researched and fully specified; **deliberately not built yet** — needs
a real Google Cloud OAuth app registered (a manual console step, not something
achievable from code) before any of this can be tested, and it's a real trust/scope
expansion worth the team consciously signing off on before work starts, not just
inheriting from this plan.
**Depends on**: F13 (needs `Application.source`/matching to exist). **Shares files
with**: none of F1-F13 — entirely new files. Safe to build in parallel with anything.

**What it is**: automatically detecting status changes (interview invite, rejection,
offer) by reading job-related emails and updating the matching `Application` row —
the same pattern Huntr/Simplify/Teal-adjacent tools use, validated via research
against several real implementations (Gmail OAuth + AI/regex classification of
subject+body into a pipeline stage).

**Critical research finding that changes the plan**: Gmail's `gmail.readonly` scope
(and even the narrower `gmail.metadata`, headers-only) are Google **"restricted"**
scopes. An app requesting them for **production use beyond 100 named test users**
must pass Google's annual CASA (Cloud Application Security Assessment) —
**$500-$4,500/year, recurring**, directly at odds with this project's entire
cost model (`JobHuntPK_v7_Final.md`'s "~$3/month, no new paid infrastructure").
**However**: apps kept in Google Cloud Console's "Testing" publishing status, with
users added individually as named test users (not "In production"), are exempt from
this requirement — and JobHunt PK's actual real-world scale (2-5 named users) fits
entirely inside that exemption. This is the path to build on. Trade-off to accept
knowingly: unverified apps in Testing mode have historically had shorter-lived
refresh tokens / more frequent re-consent prompts than verified production apps —
annoying, not blocking, and dramatically cheaper than $500+/year for a 2-5 person
tool. **Re-confirm this exemption's exact current terms in the Google Cloud Console
UI at implementation time** — Google's policies here shift and this research has a
shelf life.

**Technical approach**:
1. **OAuth connection flow**: `backend/src/routes/emailIntegration.js` —
   `GET /connect` redirects to Google's consent screen requesting `gmail.readonly`
   (needed for body/snippet text, not just headers, since classification needs more
   than subject lines); `GET /callback` exchanges the code for tokens.
2. **New table, `EmailIntegration`**: `userId`, `provider` (`'gmail'`, `'outlook'`
   later), `refreshTokenEncrypted` + `iv` + `authTag` (same AES-256-GCM scheme as
   `ApplyCredential` — reuse `cryptoService.js`, don't reinvent), `connectedAt`,
   `lastSyncAt`, `isActive`. Flagged the same way every other schema addition in
   this plan was — needs the same explicit sign-off before migrating.
3. **Sync job**, `backend/jobs/emailStatusSync.js` (mirrors the `dailyJobFetch`/
   `applyBotSelect` pattern): for each active `EmailIntegration`, query
   `messages.list` with a `q` search combining known ATS/job-board sender domains
   and keyword filters (`from:(greenhouse.io OR lever.co OR ashbyhq.com OR
   linkedin.com OR indeed.com) newer_than:3d`), skip messages already processed
   (track a `processedMessageIds` set or a `lastSyncAt` cursor), classify candidates.
4. **Classification via the existing AI queue, not a new regex taxonomy.** Unlike
   resume skill-extraction (a good fit for fixed keyword lists — skills are
   enumerable), email phrasing across arbitrary company templates is exactly the
   kind of unstructured-text problem the project already uses Groq for (cover
   letters, summaries). New task type `classify_status_email` on the existing
   `aiQueue`/`aiWorker`, returning `{ stage, confidence, matchedCompany }`.
5. **Never auto-apply the detected change — always a suggestion, not a silent
   update.** This is a deliberate difference from the auto-apply bot's fully-
   autonomous design: the bot's actions are reversible/low-stakes if wrong (an extra
   application), but silently marking a real application "Rejected" or "Offer" based
   on a misclassified email actively misleads the user about their own job search.
   Recommend: detected changes land as a pending suggestion (new `ApplyTask`-style
   audit row, or a lightweight `status: 'suggested'` overlay on the `Application`
   row) that the user approves with one click before it changes the real status.
   Flagging this as a recommendation, not a mandate — same as other places in this
   plan where a stricter default was chosen deliberately; override if the team
   decides differently once real classification accuracy is known.
6. **Matching a detected email to an existing `Application`**: by company name
   (same normalization `applyBotSelect.js`'s dedupe already uses) within a
   reasonable window of that application's `appliedAt`. Explicitly **out of scope**
   for this feature to *create* a new `Application` from an email alone (e.g. for a
   job applied to entirely outside this system) — that needs a much higher
   confidence bar than updating an existing, already-confirmed row, and is a
   reasonable "F14 phase 2" idea, not initial scope.

**Risks**:
- The CASA/scope-tier finding above — re-verify at build time, policies shift.
- Classification accuracy is unproven without real data — start the confidence
  threshold conservative (favor "no suggestion" over a wrong one), tune with real
  examples the same way `docs/apply-bot/04`'s confidence-tuning approach works for
  form-filling.
- `gmail.readonly` grants access to the whole inbox, not just job-related mail —
  the `q` search query narrows what's *fetched*, but the OAuth grant itself is
  broader than what's used. Worth being explicit about this in whatever consent/
  privacy explanation is shown to users before they connect their email — they
  should understand the scope of what they're authorizing, not just what the
  feature does with it.
- Outlook/Microsoft Graph (`Mail.Read` scope) is a real alternative path with a
  different app-registration model (Azure AD, admin consent) — not researched to
  the same depth here; if any team member uses Outlook rather than Gmail, that's a
  second, separately-scoped integration, not a drop-in.

**Definition of done**: not defined yet — this needs its own scoping pass once the
team has explicitly signed off on the OAuth/trust expansion and a real Google Cloud
project exists to test against. What's here is enough to start that conversation and
a first implementation attempt, not a finished spec.

---

## "System Ready" — What Finishing This Plan Actually Means

F12 is the last feature by design, not by number — everything before it is a
prerequisite. When F12's checklist is satisfied, the system is what was originally
asked for: a bot that catches each day's new postings, auto-applies to the ones that
match, and hands control to a human only for a CAPTCHA or email-verification
challenge via a live view. Concretely, "ready" means:

- F1-F3: infrastructure verified against a real database and a real deployed
  `apply-bot` service (not just "builds without errors").
- F4, F5, F6: Lever, Greenhouse, and Ashby applications fill correctly in shadow
  mode against real postings, with CAPTCHA correctly detected rather than silently
  mis-handled — all three via browser automation (no API shortcut exists for any of
  them, see the F4 correction above).
- F7 + F11's live-view half: a human can actually watch and solve a real CAPTCHA or
  email-verification prompt and have the bot resume on its own afterward.
- F9, F10: you can answer "is this working" from data, not from hoping, and a broken
  adapter fails a test before it fails in production.
- F11's credential half: a user manages their own platform logins without needing
  API tools.
- F12 itself: at least one adapter has run in live mode for real, been reviewed, and
  trusted enough to leave running — with the daily selection (and sweep) actually
  running on a schedule, not manually triggered, and a Railway deploy able to happen
  mid-task without losing or duplicating an application.

The 2026-08-17 security and reliability passes (see both sections above) are what
make "ready" mean more than "the happy path works": a crashed process resolves into
a state a human can act on instead of silence or a duplicate application, a
malicious or scraped `applyUrl` can't turn the bot into a network probe, and a
redeploy doesn't quietly eat whatever task was mid-flight. None of that shows up in
a demo of the happy path — it's what determines whether the system holds up in
week 3 instead of just day 1.

F8 (the generic engine) is explicitly **not** on this critical path — the three
known-ATS adapters (F4/F5/F6) are where the real, reliable value is. Treat F8 as a
future expansion once the core system above is live and trusted, not as a blocker to
calling the system "done."

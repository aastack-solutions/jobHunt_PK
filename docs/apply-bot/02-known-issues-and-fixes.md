# 02 — Known Issues and Fixes

An honest list of what's built but not proven to work, in the order you'll hit them
if you start from "run it for the first time." Nothing here is hidden — this is
everything flagged during the build, collected in one place.

> **Security findings are tracked separately**, in `TECHNICAL_PLAN.md`'s "Security
> Findings & Fixes" section (SSRF via `applyUrl`, a timing side-channel on the
> internal secret comparison, a missing task-duration ceiling, and a shared
> rate-limit bucket between public and internal traffic — all four fixed and
> verified 2026-08-17). Not duplicated here to avoid the two lists drifting apart.

## 1. Migration never applied to a real database

**Status**: `backend/prisma/schema.prisma` has the new models; no `migrate dev` has
run against any Postgres instance.

**Fix**: get Postgres + Redis running locally (Windows services per
`HOW_TO_RUN.md`, or Docker if you'd rather), then:
```powershell
cd backend
npx prisma migrate dev --name apply_bot_tables
```

## 2. `backend/apply-bot/` dependencies never installed

**Status**: `package.json` lists `playwright@1.49.1` and friends, but `npm install`
and `npx playwright install --with-deps chromium` have never run. The exact
Playwright version pin hasn't been checked for compatibility with Node 22 in
practice — it's a reasonable-looking pin, not a verified one.

**Fix**:
```powershell
cd backend/apply-bot
npm install
npx playwright install --with-deps chromium
```
If `npm install` fails or resolves a different Playwright minor version than
expected, that's worth a note back here — the pin may need adjusting.

## 3. Adapter selectors are unverified against live postings

**Status**: see [01-research-plan.md §A](01-research-plan.md#a-verify-the-greenhouselever
ashby-selectors-against-real-postings) — this is the biggest open risk. The
adapters *will* run without crashing (syntax-checked), but "runs" and "correctly
fills the right fields" are different claims.

**Fix**: research task, not a code fix — see §A above for the method. Update
`greenhouseAdapter.js`/`leverAdapter.js`/`ashbyAdapter.js` selectors once you have
real DOM to compare against.

## 4. React-hydration timing risk

**Status**: `worker.js`'s `processTask()` waits for `domcontentloaded` before handing
the page to an adapter:
```js
await withRetry(() => session.page.goto(task.applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }));
```
If any of the three ATS forms render fields via client-side JS after that event
(common for Ashby, plausible for Greenhouse's newer embedded board), the adapter
will scan an empty/partial form and abstain even on a normal job.

**Fix**: once §A's research confirms which platforms need it, add a
`page.waitForSelector(...)` for a known stable form element (or
`waitUntil: 'networkidle'`, though that's slower) before calling `fillApplication()`.
Don't apply this blindly to all three — Greenhouse's classic board is server-rendered
and doesn't need it; adding an unnecessary wait just slows every run down.

## 5. End-to-end request/response flow untested

**Status**: `internal.js`'s `GET /apply-bot/tasks/:id` (claim) and
`POST /apply-bot/tasks/:id/callback` (report) have never been called by a real
worker against a real backend. This includes the credential
encrypt/decrypt round-trip (`cryptoService.js`), the session-state encrypt/decrypt
round-trip (separate `sessionStateIv`/`sessionStateAuthTag` columns — see the inline
comment in `schema.prisma` explaining why they're separate from the credential's own
`iv`/`authTag`), and the R2 screenshot upload/signed-URL flow.

**Fix**: after §1 and §2 are done, the cheapest first test is:
1. Register a test user, create one `ApplyCredential` via
   `PUT /api/apply-credentials/greenhouse` with throwaway test values.
2. `GET /api/apply-credentials` — confirm the response never contains
   `credentialEncrypted`/`iv`/`authTag` (checking `publicCredential()` in
   `applyCredentials.js` actually redacts correctly, not just that it compiles).
3. Manually insert an `ApplyTask` row (or trigger `applyBotSelect.js` against a real
   job with a `greenhouse.io` `applyUrl`) and let the worker claim it — confirm the
   decrypted username/password in the claim response match what you stored.

## 6. Zero automated tests

**Status**: nothing in this feature has a test file. Every check so far has been
`node --check` (syntax only) and `npx prisma validate` (schema only) — neither
proves behavior.

**Fix**: at minimum, before trusting this in shadow mode, add:
- A unit test for `cryptoService.js`'s encrypt→decrypt round trip (including the
  JSON variants).
- A unit test for `applyBotPlatform.js`'s `resolvePlatform()`/`requiresCredential()`
  against a handful of real URLs from each source.
- A unit test for `fieldTaxonomy.js`'s `bestMatch()` against a small fixture HTML
  page with known fields, to catch synonym-matching regressions as the list grows.

## 7. `resolvePlatform` logic is duplicated across the service boundary, by design

**Status**: `backend/src/services/applyBotPlatform.js` (used by the selection step to
decide if a credential is required) and `backend/apply-bot/src/adapters/index.js`
(used by the worker to pick an adapter) both do hostname matching independently —
intentional, since the two services don't share code (§1 of the plan explains why).
The risk is drift: if you add a new platform to one and forget the other, the
selection step might create a task the worker can't actually execute (falls through
to "no adapter matched", reported as `failed`/`UNKNOWN`).

**Fix**: no code fix needed now (only 3 platforms, low drift risk), but when adding a
4th platform, update both files in the same change and note it in this doc's future
revision.

## 8. Company-name dedupe is a blunt exact-match

**Status**: `applyBotSelect.js`'s dedupe check
(`appliedCompanies.has(job.company.toLowerCase().trim())`) will treat "Acme Inc" and
"Acme Inc." as different companies and let both through, or treat "Acme" and "Acme
Consulting" (a genuinely different company) as unrelated when they might not be.

**Fix**: not worth fixing speculatively — watch real data first. If duplicate
applications to variously-spelled versions of the same company show up in
`Application`/`ApplyTask` rows, that's the signal to add fuzzy matching (and it'll be
obvious from the data what normalization is actually needed, rather than guessing
now).

## 9. Object-level retry schedule is a guess, not tuned

**Status**: `browserSession.js`'s `RETRY_SCHEDULE_MS = [500, 1500, 3000]` was copied
from the ProBot reference architecture as-is. It may be too aggressive (wasting ~5s
per genuinely-broken selector before giving up) or not aggressive enough (a slow but
working page needs more than 3 attempts) — no data exists yet either way.

**Fix**: leave as-is until §03's failure-class breakdown shows `PORTAL_LAYOUT`
failures clustering in a way that suggests the retry window is wrong, then tune with
real numbers instead of guessing twice.

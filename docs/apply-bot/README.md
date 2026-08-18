# Auto-Apply Bot — Working Docs

This folder is the working documentation set for the auto-apply bot feature (the
architectural plan itself lives outside the repo, at
`C:\Users\Yasir\.claude\plans\all-the-things-is-federated-blossom.md` — these docs
are the *execution* layer under that plan: what to research, what's actually broken
or unverified in the Phase 1 code, how to measure whether it's working, how to tune
it, and how to run it safely long-term).

**For a 2-person team splitting this work, start here, not with doc 01:**

- **[TECHNICAL_PLAN.md](TECHNICAL_PLAN.md)** — the master document: 14 numbered,
  independently-scoped features (F1-F14) with technical approach, files, risks, and
  a definition of done for each, plus a dependency graph, shared-file coordination
  rules, and two written interface contracts for splitting work between two people.
  Research-backed — includes real architecture corrections (Lever should use its
  official API, not browser automation; Gmail status-tracking needs to stay in
  Google's "Testing" OAuth mode to avoid a $500+/yr audit) discovered after the
  original plan was written.
- **[TEST_PLAN.md](TEST_PLAN.md)** — a checklist of test cases per feature (F1-F14),
  🤖 automated / 🖐️ manual, meant to be worked through and checked off right after
  building each feature, not saved for the end.
- **[`../../MEMORY.md`](../../MEMORY.md)** — the shared, continuously-updated log of
  what's actually done, who's working on what, and a dated decisions log. Read this
  every time you sit down to work; update it before you stop.

Then, the deep-dive references (linked from the plan above where relevant):

1. **[01-research-plan.md](01-research-plan.md)** — what needs real investigation
   before Phase 2 (or before trusting Phase 1) makes sense: ATS DOM verification,
   CAPTCHA-solving vendor evaluation, ToS/legal review, missing-field decisions,
   anti-bot-detection risk.
2. **[02-known-issues-and-fixes.md](02-known-issues-and-fixes.md)** — an honest list
   of what's built but *unverified* or known-incomplete in the current code, with a
   concrete fix for each.
3. **[03-failure-measurement.md](03-failure-measurement.md)** — how to calculate
   failure rate, abstain rate, and CAPTCHA-hit rate from data the schema already
   captures, with queries you can run today (once the DB migration is applied).
4. **[04-confidence-and-filter-tuning.md](04-confidence-and-filter-tuning.md)** — how
   to reduce unnecessary abstains/skips over time *without* weakening the
   never-guess-on-required-fields safety rule.
5. **[05-best-practices.md](05-best-practices.md)** — ongoing operating discipline:
   shadow-to-live rollout pace, selector-drift watch, credential hygiene, kill-switch
   drills, cost monitoring.

## Current status (as of this doc set)

Phase 1 is **built but not yet run**. No local Postgres/Redis was available in the
dev session that wrote this code, so:

- The Prisma migration for `ApplyCredential`/`ApplyTask`/`Application.applyUrl` has
  **not** been applied to any database yet.
- `backend/apply-bot/`'s dependencies have never been `npm install`-ed, and
  `npx playwright install --with-deps chromium` has never been run.
- The Greenhouse/Lever/Ashby adapter selectors were written from documented/typical
  conventions, **not verified against a live posting** (no network/browser access in
  that session).
- Nothing in this feature has executed end-to-end even once.

Treat everything below as a plan for turning "written" into "known to work" — not as
a report on a working system.

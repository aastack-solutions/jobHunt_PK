# JOBHUNT.md — Project Status & "What's Done"

A plain-English map of what JobHunt PK does, what currently works, what was recently
fixed, and the known gaps. For the full spec see `JobHuntPK_v7_Final.md`; for run
instructions see `HOW_TO_RUN.md`; for engineering rules see `CLAUDE.md` (and the
per-directory `CLAUDE.md` files).

_Last updated: 2026-07-08._

---

## What the app is

A self-hosted, small-team job tool. It fetches jobs every morning, scores each one
against each team member's resume, and gives one dashboard to review matches, track
applications, manage interviews, and generate AI cover letters. Two job pools:

- **Remote** — from anywhere in the world.
- **Onsite/Hybrid** — Karachi only (hard-filtered before scoring).

## The core flow (how a job reaches you)

```
Sources (Remotive, Arbeitnow, Himalayas, Adzuna, Jooble, Mustakbil-Karachi)
  → normalize (location type, city, skills, salary, 30-day expiry)
  → dedupe + batch insert into Jobs
  → eligibility filter (Remote vs Karachi, per user preference)
  → matching engine (Skill 55% + Experience 30% + Salary 15%)
  → JobMatch rows → Jobs page / Dashboard / daily email digest
```

Resume side: upload PDF/DOCX → **resume-parser** (Python) extracts skills + experience
→ stored on the active resume → uploading/editing skills re-runs matching for that user.

---

## Job freshness — how fresh jobs are surfaced

Jobs stay in the database for **30 days** (each gets `expiresAt = fetchedAt + 30 days`),
and the daily fetch keeps *adding* new ones — it does not wipe the pool. So the raw pool
can hold roughly a month of listings. To keep you applying to **fresh** jobs, the Jobs
page surfaces recent ones on top instead of showing the whole 30-day pool:

- **Default view:** *Posted: last 3 days* + sorted by **best match**. So you see recent,
  well-matched jobs first — not month-old ones.
- **Freshness filter:** switch between **last 24h / last 3 days / last 7 days / any time**.
- **"New · Xh ago" badge (green):** shown on every job posted within the **last 24 hours** —
  these are the ones worth prioritising when you apply.
- **"Sort: Newest":** orders by the employer's post date (falls back to our fetch date
  when a source didn't provide one).

Freshness is based on **`postedAt`** (when the employer posted), with **`fetchedAt`**
(when we pulled it) as the fallback. The pool is never hard-cut to 3 days — the filter
only narrows the *view*, so a slow fetch day never leaves the page empty. (Reference
numbers, 2026-07-08: 454 total matches, ~337 within 3 days, ~107 within 24h.)

> Note: this is *surfacing*, not auto-applying. Applying to the "New" jobs is still done
> by you — see the auto-apply note under "Known gaps".

---

## Current status — what works

| Area | Status |
|------|--------|
| Auth (register / login / sessions) | ✅ Working |
| Job fetching (6 sources) | ✅ Working (516 active jobs locally) |
| Resume upload + **skill parsing** | ✅ Working (parser must be running — see gaps) |
| Resume **preview** (new tab) | ✅ Just-uploaded file works; history needs R2 |
| **Matching** (skill/exp/salary) | ✅ Working & meaningful after this session's fix |
| Jobs page: filters, search, **freshness**, sort, min-score | ✅ Working |
| AI cover letter (Groq) | ✅ Working (needs `GROQ_API_KEY`) |
| Applications tracker | ⚠️ Exists, but "Apply" doesn't yet record an application (see gaps) |
| Interviews, dashboard, email digest | ✅ Built (email needs Brevo keys) |

---

## What was fixed / added this session (2026-07-08)

1. **Resume parser was completely down locally.** No venv, no deps installed → every
   upload returned empty skills, so users hand-typed vague skills that broke matching.
   Fixed: created `resume-parser/.venv`, installed deps, launched on `:8000`.
   - Gotcha documented: the parser must be launched with `INTERNAL_SECRET` matching
     `backend/.env`, otherwise every `/parse` gets 401 → empty skills.
   - Image-based/scanned PDFs (e.g. `adeeb-izhar-Mern-CV.pdf`) correctly return
     "image-based, enter skills manually". Use a text PDF to get real skills.

2. **Matching was effectively dead — every job scored ~65%.** Jobs had no skills (or
   noisy source tags), so the skill sub-score (55% weight) always hit the neutral
   fallback and a MERN resume "matched" Java/C++/SQL equally.
   Fixed by giving jobs real skills + smoothing:
   - **Job skill extraction** — every job now derives canonical skills from its
     title+description using the *same* vocabulary the resume parser uses, so both
     sides speak one language and overlap actually means something.
   - **Vocabulary expanded** (~55 skills: unity, unreal, .net, wordpress, salesforce,
     sap, spark, …) in both `jobFetcher.js` and the parser (kept mirrored), so
     unrelated roles surface their true stack and score low instead of matching on one
     incidental keyword.
   - **Denominator smoothing** in the skill score: `matched / max(total, 4)` — a job
     with only 1–2 extracted skills can no longer hit 100% off a single match. Jobs
     with ≥4 skills are scored exactly as the spec's `matched/total`.
   - Result: MERN/React/TS roles now rank **67–87% (Good/Excellent)**; Java/C++/.NET/
     Unity dropped to **14–45% (Low)**.

3. **Resume preview** — added. A just-selected file opens in a new tab (works without
   storage). Upload History shows a **Preview** button for stored files, or "Not stored"
   when the file wasn't persisted. Dropzone label switches Upload ↔ Update.

4. **Freshness on the Jobs page** — jobs live in a 30-day pool, but the page now:
   - defaults to **"Posted: last 3 days" + best-match sort**,
   - has a filter (last 24h / 3 days / 7 days / any time),
   - shows a green **"New · Xh ago"** badge on jobs ≤24h old,
   - wires up **"Sort: Newest"** (by post date).
   - Also fixed a pre-existing bug: the min-score slider and sort dropdown weren't
     reaching the backend at all.

5. **Spec restored** — `JobHuntPK_v7_Final.md` (the single source of truth referenced by
   `CLAUDE.md`) was missing from the repo; transcribed it back in from the PDF.

---

## Known gaps / things to decide

- **No "auto-apply".** These are aggregated external listings — the app cannot submit
  applications on the external ATS. Per spec, "Apply" = one-click *mark as applied* +
  generate a cover letter. Right now the Apply button only opens the cover-letter modal;
  it does **not** yet create an Application record. (Next candidate fix.)
- **R2 (file storage) not configured locally.** Uploaded resumes aren't persisted, so
  history files show "Not stored" and can't be previewed/downloaded later. Configure
  Cloudflare R2 to enable persistent preview.
- **Non-tech jobs sit at ~65%.** Jobs with no extractable tech skills get the spec's
  neutral score (60). This is spec behaviour, not a bug; can be tuned if desired.
- **Parser must be running** for uploads to parse; it's a separate service on `:8000`.

---

## Run it locally (quick pointer)

Full steps are in `HOW_TO_RUN.md`. In short: Postgres 17 + Redis (Memurai) running →
backend on `:5000` → frontend (Vite) on `:5173` → resume-parser (uvicorn) on `:8000`
launched **with `INTERNAL_SECRET` set** to match `backend/.env`.

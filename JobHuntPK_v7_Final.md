# JobHunt PK — v7 Final

**Remote & Onsite (Karachi) Job Application Automation Platform**
Technical Architecture and Engineering Specification — CONFIDENTIAL

Prepared by: Engineering Team · Date: June 2026

> **Transcription note:** This file was transcribed verbatim from `JobHuntPK_Spec.pdf`
> to restore the single source of truth referenced by `CLAUDE.md`. Where this document
> and `CLAUDE.md` disagree — specifically the `jobType` field (code uses `locationType`)
> and the `salaryMinUSD`/`salaryMaxUSD` fields (code computes USD at match time and does
> not store them) — **`CLAUDE.md` is authoritative**; those divergences are intentional
> corrections made after this spec was written.

> **Auto-Apply Bot addendum (2026-08-13):** this document's Core Features and System
> Architecture sections below describe the *original* committed build — they do not
> mention an auto-apply bot, because this spec predates that feature. An auto-apply
> bot (Playwright automation against Greenhouse/Lever/Ashby postings, running as a
> separate `backend/apply-bot/` Railway service) was added afterward as an explicitly
> authorized deviation from this spec's scope — see the approved plan for the full
> design, and `backend/prisma/CLAUDE.md` for the resulting schema changes
> (`ApplyCredential`, `ApplyTask`, `Application.applyUrl`). It also breaks this
> document's "four Railway services, ~$3/month" cost claim in §System Architecture,
> which should no longer be treated as accurate once that service is deployed.

---

## Overview

JobHunt PK is a self-hosted, team-facing web application that automates job searching and applications. It works across two separate pools of listings at the same time: fully remote jobs sourced from anywhere in the world, and onsite or hybrid jobs that are restricted to Karachi only. The platform fetches new listings every morning, scores each one against each team member's resume, and gives the team a single dashboard to review matches, track applications, manage interviews, and generate AI-assisted cover letters.

The guiding rule for the whole system is simple: a remote job can come from anywhere and is shown to anyone who wants remote work; an onsite or hybrid job is only ever shown if it is physically located in Karachi. This rule is enforced as a hard filter inside the matching engine, described in detail in the Job Matching Algorithm section.

The technology stack, hosting platform, and monthly cost are unchanged from the original platform this is based on. Everything below runs on the same four Railway services for roughly $3 per month, with no new paid infrastructure introduced for the Karachi/Remote split.

### What Makes This Different

Compared to a plain remote-only job board, three things are added: a location and job-type classification on every listing, a hard eligibility filter that runs before any scoring happens, and currency normalization so that salaries quoted in PKR (common for Karachi onsite roles) and salaries quoted in USD (common for remote roles) can be compared fairly.

### Who This Is For

This remains a small internal team tool, not a public product — 2 to 5 user accounts, no public signup, no payment system. Each team member independently controls whether they want to see Remote jobs, Karachi-onsite jobs, or both.

---

## Core Features

The features below make up the committed build — the version of the product the 8-week roadmap is designed to deliver. Speculative ideas that are not part of this commitment are kept separately in the Future Ideas section near the end of this document.

### Resume Management

Team members upload a resume as PDF or DOCX. A private parsing service extracts skills, years of experience, and seniority level automatically. If the PDF is image-based (a scanned document with no selectable text), the system detects this and prompts the user to enter their skills manually instead of failing silently.

### Job Discovery

Every morning at 05:00 UTC, the system fetches new listings from two source groups: the existing global remote job sources, and a new set of Pakistan-focused sources for onsite and hybrid roles. Every listing is tagged with a job type (Remote, Onsite, or Hybrid) and, where applicable, a city. Both groups land in the same jobs table and go through the same deduplication logic, so the same listing never appears twice even if two different sources publish it.

### Smart Matching

Each team member sets two independent preferences: whether they want to see Remote jobs, and whether they want to see Onsite jobs in Karachi. Both can be switched on together. Before any score is calculated, the system checks whether a given job is even eligible for a given user based on these preferences and the job's location — only eligible jobs are scored and shown. Eligible jobs are then scored 0 to 100 based on skill overlap, experience alignment, and salary compatibility, with a clear breakdown of why each score was given.

### Application Tracker

Users mark jobs as applied with one click, and each application moves through a seven-stage pipeline: Applied, Viewed, Phone Screen, Interview, Technical Test, Offer, and Rejected/Withdrawn. A short note can be attached to any application at any stage.

### AI Cover Letters and Summaries

Using Groq's free-tier language model, users can generate a tailored cover letter for any job, get a short bullet-point summary of a long job description, or receive a set of interview preparation questions — all on demand from the dashboard, at no extra cost.

### Interview Tracker

Interviews are scheduled with a type, link or location, interviewer name, and notes. A reminder is sent automatically 24 hours before each interview. For onsite interviews specifically, the reminder also includes the office address and a one-click link to map directions, since travel time matters for an in-person interview in a way it simply doesn't for a remote one.

### Dashboard Analytics

The dashboard shows total applications, applications this week, interview rate, offer rate, an application funnel chart, a platform breakdown, and a weekly activity trend. Because Remote and Karachi-onsite jobs have different scoring inputs (currency, distance), the dashboard offers separate Remote and Onsite-Karachi views alongside a combined view.

### Daily Email Digest

Each morning after the fetch completes, every team member receives a single email containing their top matches from both pools — typically their top five Remote matches and top five Karachi-onsite matches — sent through the same free transactional email service used for interview reminders.

---

## System Architecture

The platform is organized as four small services that talk to each other over a private network. This section describes how those services fit together and the handful of deliberate design choices that keep the system simple, cheap, and reliable.

### Services

| Service | Technology | Purpose | Approx. RAM |
|---------|-----------|---------|-------------|
| Backend | Node.js 22 LTS | API server, serves the compiled frontend, runs the background job queues, the job fetcher, and the matching engine | 185 MB |
| Resume Parser | Python 3.13 + FastAPI | Extracts text and skills from uploaded resumes; reachable only from the backend, never from the public internet | 80 MB |
| Database | PostgreSQL 17 | Stores users, jobs, matches, applications, and interviews | 80 MB |
| Cache and Queues | Redis 8 | Sessions, background job queues, login-lockout counters, and the daily cached exchange rate | 20 MB |

Total memory usage stays around 365 MB against a 512 MB limit, and the monthly Railway cost stays close to $3, well inside the free monthly credit. Nothing about the Remote/Karachi split changes this, since the new logic is implemented as ordinary backend code rather than as a new service.

### Design Decisions

**One Domain for Frontend and Backend** — The frontend is compiled to static files and served directly by the backend from the same domain, which avoids any cross-origin request complexity and the cost of running a separate frontend service.

**The Resume Parser Has No Public Address** — The parser only accepts requests from the backend over the private internal network, authenticated with a shared secret header. It cannot be reached from outside the platform at all.

**Background Workers Start After the Server Is Ready** — Workers are started only once the web server is fully listening, not as soon as the code loads. This avoids a known issue where a brief overlap during deployment could otherwise start two workers on the same queue and cause a task to run twice.

**Jobs Are Inserted in One Batch** — All of a day's new listings, whether Remote or Karachi-onsite, are inserted into the database in a single batch call rather than one row at a time, with duplicates skipped automatically by a database constraint. This avoids overwhelming the database connection pool during the daily fetch.

**Location Eligibility Is a Hard Filter, Not a Score** — This is the one truly new architectural decision in this specification. A job's location and job type are checked before any scoring happens at all, not folded in as a fourth weighted factor. An onsite job located outside Karachi is never scored and never recorded as a match for any user — it behaves as if it doesn't exist from the matching engine's point of view. This keeps the original scoring formula untouched and keeps results free of irrelevant noise.

### Data Flow

The same pipeline runs for both Remote and Karachi-onsite listings — the only difference is which source group they enter from and which filter step they pass through.

```
Remote sources (global job APIs and feeds)   Karachi onsite sources (Pakistan job boards)
                          │
                          ▼
   Normalize each listing — assign job type, city, currency, and an expiry date
                          ▼
   Deduplicate and insert — exact match plus a content fingerprint, one batch DB call
                          ▼
                 Jobs table (PostgreSQL)
                          ▼
   Location eligibility filter, checked per user — Remote always passes; Onsite/Hybrid
   only passes if the job is in Karachi and the user opted in
                          ▼
   Matching engine — skill, experience, and currency-normalized salary scoring
                          ▼
        Matches table, one row per eligible user/job pair
                          ▼
              Dashboard   +   Daily email digest
```

---

## Database Design

The database has seven tables. Four of them are unchanged from the base design; three gain a small number of additional fields to support the location and currency logic.

### Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| User | Team member accounts and preferences | email, passwordHash, salaryMin, salaryMax, wantsRemote, wantsOnsiteKarachi, homeArea |
| Resume | Uploaded resumes with parsed data | fileKey, parsedSkills, experienceYears, seniorityLevel |
| Job | Fetched listings from every source | platform, contentHash, jobType, city, area, currency, salaryMinUSD, salaryMaxUSD, expiresAt |
| JobMatch | Per-user score for every eligible job | matchScore, skillMatchScore, experienceMatchScore, salaryMatchScore |
| Application | Applications and their pipeline status | status, coverLetter, notes, appliedAt |
| Interview | Scheduled interviews and reminders | scheduledAt, interviewType, meetingLink, reminderSent |
| SchedulerLog | A record of every background job run, for monitoring | jobName, status, jobCount, ranAt |

> Note per transcription banner above: the shipped schema uses `locationType` (not `jobType`)
> and does **not** store `salaryMinUSD`/`salaryMaxUSD` — USD is computed at match time. See `CLAUDE.md`.

### How the Tables Relate

Every table other than SchedulerLog is connected back to either a user or a job. One user has many Resume, Application, JobMatch, and Interview rows. Application and JobMatch each also point to exactly one Job. SchedulerLog is kept separate, written only by background jobs, not linked to users or jobs.

| Relationship | Type | Meaning |
|--------------|------|---------|
| User to Resume | one to many | a user may upload more than one resume over time; only one is active |
| User to Application | one to many | a user's full application history |
| User to JobMatch | one to many | every eligible job gets its own score row per user |
| User to Interview | one to many | via the related application |
| Job to JobMatch | one to many | one job can be matched against several users |
| Job to Application | one to many | more than one team member can apply to the same listing |

### New and Changed Fields

| Field | Table | Purpose |
|-------|-------|---------|
| jobType | Job | Remote, Onsite, or Hybrid — drives the eligibility filter |
| city | Job | Required, and must equal Karachi, when jobType is Onsite or Hybrid; left empty for Remote |
| area | Job | Neighbourhood text, used only for sorting Karachi-onsite jobs by approximate distance |
| currency, salaryMinUSD, salaryMaxUSD | Job | Raw salary is kept as listed; a USD-normalized value is computed once at insert time so the salary score can compare PKR and USD listings fairly |
| wantsRemote, wantsOnsiteKarachi | User | Independent preference toggles; both may be true at once |
| homeArea | User | Optional, only used for the Karachi "near me" sort |

### Indexes

Every foreign key column is indexed by default. Two additional indexes matter most for performance at this scale: a combined index on the job's type, city, and active status, since the eligibility filter runs this lookup on every matching cycle; and an index on the match score per user, since the dashboard always sorts jobs by relevance.

---

## Authentication and Security

Authentication is a straightforward email and password flow, with sessions stored server-side rather than as a token the browser has to manage. There is no third-party login provider, by design — for a 2 to 5 person internal tool, it adds complexity without adding real benefit.

### Security Layers

| Layer | How It Works |
|-------|-------------|
| Password storage | Hashed with a deliberately slow algorithm, never stored or logged in plain text |
| Login rate limiting | A small number of attempts allowed per IP address in a short window |
| Account lockout | Tracked by email address rather than IP, so an attacker rotating IP addresses still gets locked out after repeated failures |
| Generic error messages | A failed login always says "invalid credentials," never revealing whether the email exists at all |
| HTTP security headers | A standard set of headers is applied to every response to reduce common browser-based attacks |
| File upload validation | Uploaded files are checked by their actual content, not their filename, and rejected if they don't match the expected format |
| Session cookies | Marked so they can't be read by JavaScript, aren't sent on cross-site requests, and only travel over HTTPS in production |

---

## Job Fetching

Every listing in the system, whether Remote or Karachi-onsite, arrives through the same daily fetch process described in Data Flow. This section lists where each pool's listings actually come from.

### Remote Sources

Remote listings come from a mix of free JSON APIs, RSS feeds, and a few free-tier API-key services covering general remote job boards. These sources have no location restriction at all — anything they return is, by definition, remote.

### Karachi Onsite and Hybrid Sources

Onsite and hybrid listings come from Pakistan-focused job boards. Each listing's location text is normalized to a single city value at fetch time; anything that doesn't clearly resolve to Karachi is still stored for completeness but is simply never eligible for matching, by the rule described in Job Matching Algorithm.

Not every job board offers a stable, documented free API the way the global remote sources do. Before adding any new local source: check its terms of service and robots file, prefer an official feed over scraping a webpage directly, and keep request rates low and cached. Sources whose terms explicitly restrict automated access should simply be skipped rather than worked around.

### Deduplication

Two checks run together to prevent the same listing appearing twice: an exact match on the source platform and its own internal job ID, and a content fingerprint built from the company name, title, and the first part of the description, which catches the same job posted to more than one board. Both checks are enforced as database constraints, so the entire day's batch can be inserted in one call with duplicates simply skipped rather than checked one row at a time.

---

## Job Matching Algorithm

Matching happens in two stages: first an eligibility check decides whether a job is even a candidate for a given user, and only then is a numeric score calculated for the jobs that pass.

### Stage One: Location Eligibility

| Job Type | Eligible When |
|----------|--------------|
| Remote | the user has Remote jobs switched on — no location check at all |
| Onsite or Hybrid | the user has Karachi-onsite jobs switched on, and the job's city is Karachi |

A job that fails this check is never scored and never appears anywhere for that user. It is not shown as a low score; it simply isn't part of that user's results.

### Stage Two: Scoring

For every eligible job, a final score from 0 to 100 is calculated as a weighted combination of three factors.

```
Final Score = (Skill Score × 0.55) + (Experience Score × 0.30) + (Salary Score × 0.15)
```

**Skill Score, 55% Weight**

| Condition | Score |
|-----------|-------|
| User has no parsed skills on file | 0, with a warning shown to the user |
| Job lists no required skills | 60, treated as neutral |
| Skills are listed on both sides | percentage of required skills the user actually has |

**Experience Score, 30% Weight**

| Condition | Score |
|-----------|-------|
| No years-of-experience requirement found in the description | 70, neutral |
| User meets or exceeds the requirement | 100 |
| User is one year short | 75 |
| User is two years short | 50 |
| User is three or more years short | declines toward a floor of 10 |

**Salary Score, 15% Weight, With Currency Normalization**

Karachi onsite roles are usually quoted in PKR; remote roles are usually quoted in USD. Before the salary table below is applied, both the job's salary and the user's expected salary range are converted to USD using that day's exchange rate, fetched once each morning and cached for 24 hours.

| Condition | Score |
|-----------|-------|
| Either salary is unknown | 70, neutral |
| Job's minimum meets or exceeds the user's minimum | 100 |
| Within 10% of the user's minimum | 80 |
| Within 25% | 55 |
| Within 40% | 35 |
| Below 40% | 15 |

**Match Labels**

| Score Range | Label |
|-------------|-------|
| 85 to 100 | Excellent |
| 70 to 84 | Good |
| 50 to 69 | Fair |
| 0 to 49 | Low |

---

## AI Features

Three optional AI-assisted features are available from the dashboard, all powered by the same free-tier language model. None of them block the rest of the application — they run through a background queue so a slow or failed AI request never freezes the page a user is on.

### Why a Queue Is Used

If several team members generate AI content at the same moment, sending all of those requests straight to the model provider risks hitting its rate limit. Requests are instead placed on a queue that releases one request every few seconds, with automatic retries and backoff if a request temporarily fails.

### Available Features

| Feature | Input | Output |
|---------|-------|--------|
| Cover letter generator | Job title, company, a portion of the description, the user's name and skills | A short, tailored cover letter |
| Job summary | The full job description | A handful of short bullet points |
| Interview prep | Job title, company, the user's skills | A mix of technical and behavioral practice questions |

### How the Frontend Waits for a Result

The page does not wait for the AI response synchronously. Instead, it submits the request, receives a job reference, and checks back every couple of seconds until the result is ready, timing out gracefully if it takes too long rather than leaving the user staring at a spinner indefinitely.

---

## Scheduler and Background Jobs

A handful of jobs run on a fixed schedule in the background, independent of any user action.

| Job | Schedule | What It Does |
|-----|----------|-------------|
| Daily job fetch | 05:00 UTC, every day | Fetches every source, inserts new listings, and runs matching for every user |
| Exchange rate refresh | 04:45 UTC, every day | Fetches the day's PKR/USD rate and caches it ahead of the job fetch |
| Interview reminders | 08:00 UTC, every day | Emails anyone with an interview in the next 24 hours |
| Weekly cleanup | 03:00 UTC, every Sunday | Deactivates old listings and permanently removes ones nobody applied to |

### Why Reliability Needs Two Layers

The schedule itself is stored in a way that survives a server restart, so a brief deploy doesn't cause a missed run. As a backup, an external free scheduling service sends the same trigger 30 minutes later, with a check in place to avoid running the same job twice if the first attempt already succeeded.

### Monitoring

Every scheduled run writes a record of its own success or failure. If the daily fetch hasn't succeeded in the last 25 hours, a warning is shown at the top of the dashboard so the team notices before it becomes a real problem.

---

## API Reference

This is a summary of the main endpoints the frontend talks to. Authentication, application, and AI endpoints follow the same shape as a typical session-based REST API; the two tables below cover the endpoints specific to job browsing and the new location preferences.

### Jobs

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | /api/jobs | Supports filtering by job type and platform, a minimum score, search text, and sorting by score or by distance for Karachi listings |
| GET | /api/jobs/:id | Returns one job along with the current user's match score and, for onsite jobs, an approximate distance |

### User Preferences

| Method | Endpoint | Notes |
|--------|----------|-------|
| PATCH | /api/users/me/preferences | Updates the Remote and Onsite-Karachi toggles and the user's home area |

---

## Technology Stack

The stack is the same proven set of tools used in the original platform this specification is based on — nothing new was introduced to support the Remote/Karachi split, since it is implemented as ordinary application code rather than new infrastructure.

### Runtimes

| Runtime | Version |
|---------|---------|
| Node.js | 22 LTS |
| Python | 3.13 |
| PostgreSQL | 17 |
| Redis | 8 |

### Backend

| Purpose | Library |
|---------|---------|
| HTTP server and static file serving | Express |
| Security headers | Helmet |
| Rate limiting | express-rate-limit |
| Sessions | express-session with a Redis store |
| Password hashing | bcrypt |
| Database ORM | Prisma |
| Background queues | BullMQ |
| Input validation | Zod |
| File uploads | Multer |
| Object storage client | AWS SDK, used against Cloudflare R2 |
| AI completions | Groq SDK |
| Email | Nodemailer |
| RSS parsing | rss-parser |
| HTTP client | Axios, used for every external API including the new currency and geocoding calls |
| Logging | Winston |

### Frontend

React with Vite as the build tool, Tailwind for styling, React Query for data fetching and polling, React Hook Form with Zod for forms, and Chart.js for the dashboard charts.

### Resume Parser

FastAPI with Uvicorn, PyMuPDF for PDF text extraction, and python-docx for DOCX extraction.

No new packages were required for currency conversion, geocoding, or the fake-listing detector described in Future Ideas — these are plain functions built on the HTTP client already in use, keeping the dependency list exactly as small as the original design intended.

---

## Deployment

The platform deploys to Railway as four services from a single repository. The build and start commands, environment variable setup, and the use of managed Postgres and Redis plugins are unchanged from the base design — no new services or deployment steps are required for the Remote/Karachi features, since they run as code inside the existing backend service.

### Setup Steps

1. Create a Railway project and connect the repository
2. Add managed PostgreSQL and Redis
3. Configure the backend service with the repository root as its build context
4. Configure the resume parser service with public networking disabled
5. Set up a free external scheduler as the backup trigger for the daily fetch
6. Set up a free uptime monitor against the health-check endpoint

### Environment Variables

All variables from the base design carry over unchanged. Two new variables are needed, and neither requires a paid signup or an API key.

| Variable | Purpose |
|----------|---------|
| NOMINATIM_USER_AGENT | A descriptive identifier required by the free geocoding service's usage policy |
| LOCAL_FETCH_DELAY_MS | A polite delay between requests to local job sources that don't offer a stable API |

---

## Build Roadmap

An eight-week roadmap, with each week ending in a milestone that should be verified in production, not just on a local machine, before moving on.

| Week | Focus | Milestone |
|------|-------|-----------|
| 1 | Foundation — repository, database schema, security middleware, first deploy | The deployed URL loads and the health check passes |
| 2 | Authentication and file storage | Register, log in, upload a resume, and see extracted skills |
| 3 | Job fetching, including the new Karachi sources and city normalization | Both Remote and Karachi-onsite listings are visible and correctly tagged |
| 4 | Matching engine, including the eligibility filter and currency normalization | Toggling the Karachi-onsite preference immediately changes which jobs appear |
| 5 | Application tracker and AI features | The full pipeline works end to end, and AI generation succeeds reliably |
| 6 | Dashboard and charts, including the Remote/Karachi split view | The dashboard shows real, separated data for both pools |
| 7 | Interviews and email, including the map link for onsite reminders | Reminder emails arrive and interview scheduling works fully |
| 8 | Hardening and polish | The team is using the system daily without manual intervention |

---

## Ongoing Maintenance

A short monthly check keeps the system healthy. Most of this is unchanged from the base design — checking bandwidth, AI usage, email volume, and storage against their free limits. One addition is specific to this version:

Local job sources without a documented stable API are the most likely thing to quietly break if the source website changes its page structure. Check the weekly job counts per source, not just once a month, so a broken Karachi-onsite source is noticed quickly rather than silently starving that pool of new listings.

---

## Security and Quality Checklist

A pre-launch checklist. Everything here should correspond to something actually implemented in code, not just intended.

- [ ] Passwords are hashed, never logged, and login failures never reveal whether an account exists
- [ ] Sessions are stored server-side and survive a restart
- [ ] Every input is validated before it reaches the database
- [ ] The resume parser has no public address and is only reachable from the backend
- [ ] Uploaded files are checked by content, not filename, and are never written permanently to local disk
- [ ] An onsite or hybrid job outside Karachi is confirmed to never appear in any user's matches
- [ ] The currency and geocoding lookups are cached, never repeated for the same input within a day
- [ ] All secrets live in environment variables, never hardcoded and never committed to the repository

---

## Future Ideas

The items below are deliberately **not** part of the committed build described above. They are ideas worth keeping on record so the team can revisit them later if one of them turns out to be genuinely useful once the core product is in daily use — none of them should be started now.

**Listing Quality** — A simple, non-AI heuristic could flag listings that show common signs of being low-quality or fake — no salary mentioned anywhere, generic "urgent hiring" phrasing, only a WhatsApp number given with no email or company website, or any mention of a "registration" or "training" fee. Flagged listings would stay visible behind a toggle rather than being deleted, since a heuristic like this can be wrong.

**Duplicate Company Guard** — A warning when a user applies to a company they already applied to in the last few months, regardless of which platform the new listing came from, to avoid accidentally double-applying to the same employer.

**Skill Gap Insights** — A small dashboard widget showing the skills that show up most often in jobs the user is matching with but that aren't yet on their resume — a gentle nudge toward what's worth learning next.

**Approximate Distance Sorting for Karachi Listings** — Sorting Karachi-onsite jobs by a rough straight-line distance from the user's home area, using a free geocoding lookup. This would be an approximation, not a real travel-time estimate, since accurate traffic-aware routing requires a paid mapping service.

**Expanding Beyond Karachi** — If the team later wants to support a second city, the eligibility filter described in this document is already written as a check against an allowed-city value rather than a hardcoded assumption, so adding a city would mean changing a setting rather than rewriting the matching logic.

**A Weekly Team Performance Summary** — A short weekly note showing who applied the most, who's converting applications into interviews at the highest rate, and which platforms are producing the best results for the team as a whole.

**Salary Benchmarking** — Comparing a job's offered salary against a rough market-rate range for that role, drawn from public salary data, to help a user judge an offer beyond just "does it meet my minimum."

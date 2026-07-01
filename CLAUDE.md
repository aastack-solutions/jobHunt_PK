# CLAUDE.md — JobHunt PK

You are building **JobHunt PK** — a self-hosted job automation platform for a small startup team.
It tracks remote jobs globally and onsite/hybrid jobs in Karachi only.

**Single source of truth:** `JobHuntPK_v7_Final.md` — read it before making any architectural decision.
If something is not in that document, ask before implementing it.

## Project Rules Are Split By Directory

Each directory has its own `CLAUDE.md` with rules specific to that layer.
Read the relevant file before touching code in that directory.

| File | Covers |
|------|--------|
| `CLAUDE.md` ← this file | Project identity, monorepo structure, never-do list |
| `backend/CLAUDE.md` | Node.js, Express, Prisma, auth, security, all services |
| `backend/prisma/CLAUDE.md` | Schema rules, field names, indexes, migration rules |
| `frontend/CLAUDE.md` | React, Vite, Tailwind 4, routing, data fetching |
| `resume-parser/CLAUDE.md` | Python, FastAPI, file validation, skill extraction |

## Monorepo Structure — Never Change This

```
jobhuntpk/               ← repo root AND Railway root (/)
├── backend/
├── frontend/
├── resume-parser/
├── CLAUDE.md
└── .gitignore
```

- Never create a fourth top-level service directory
- Never move files between `backend/`, `frontend/`, `resume-parser/`
- Railway backend service root directory = `/` (monorepo root) — never `/backend`

## Tech Stack At a Glance

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 LTS, Python 3.13 |
| Backend | Express 5.2.1, Prisma 7.8.0, BullMQ 5.79.1 |
| Frontend | React 19.2.7, Vite 8.0.16, Tailwind 4.3.1 |
| Database | PostgreSQL 17 (Railway managed) |
| Cache/Queue | Redis 8 (Railway managed) |
| File storage | Cloudflare R2 (free, 10 GB) |
| AI | Groq free tier (llama3-8b-8192) |
| Email | Brevo SMTP (free, 300/day) |

Full pinned version list is in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Absolute Prohibitions

These apply everywhere in the codebase. No exceptions.

- No `ioredis` — use `redis@4.7.1` (official client)
- No `cors` middleware — frontend and backend share one domain (same-origin)
- No `jsonwebtoken` — auth uses server-side sessions, not JWT
- No `react-router-dom` — use `react-router@7.18.0`
- No `json2csv` — use `@json2csv/plainjs`
- No raw SQL — Prisma only, parameterized queries only
- No `diskStorage` in multer — memory storage only, files go to R2
- No `salaryMinUSD` / `salaryMaxUSD` fields anywhere — compute at match time
- No `jobType` for location — use `locationType` (Remote/Onsite/Hybrid)
- No stack traces in production API responses
- No hardcoded secrets — all in Railway env vars
- No features from Section 25 (Future Ideas) without explicit instruction
- No public signup, payment system, or SaaS features

## When You Are Uncertain

1. Re-read the relevant section of `JobHuntPK_v7_Final.md`
2. If covered, follow the document exactly
3. If not covered, ask before implementing
4. Never make architectural decisions based on "what seems reasonable"

When a week's milestone is complete, say:
**"Week N complete. Milestone: [exact milestone text]. Ready for next task."**
---
description: Current changes ka poora code review — bugs, quality, spec compliance, rules
argument-hint: (optional) file, area, ya "staged"
allowed-tools: Bash(git:*), Grep, Glob, Read
---

Tum JobHunt PK ka **code review** kar rahe ho — ek senior engineer ki tarah. Yeh review-only hai: code change mat karo jab tak user na kahe.

## Scope
Pehle `git diff` (aur `git diff --staged`) dekho. `$ARGUMENTS` diya ho to us file/area/"staged" pe focus karo. Bina diff ke bhi kisi named file ka review kar sakte ho.

## Kya dekhna hai

### 1. Correctness / Bugs (sab se zaroori)
- Logic errors, edge cases, null/undefined handling, async/await galtiyan
- Express 5 async errors auto-catch hote hain — handlers mein fazool try/catch/next na ho
- Error paths: sahi status codes, koi unhandled rejection nahi
- Race conditions (workers, Redis, sessions)

### 2. Spec Compliance
- Kaam `JobHuntPK_Spec` ke mutabiq hai? (matching formula, eligibility hard-filter, currency normalization, 7-stage application pipeline, etc.)
- Jo bana hai woh us week ke milestone se match karta hai?

### 3. Architecture & Rules (CLAUDE.md)
- Prohibitions ka koi violation? (`ioredis`, `cors`, JWT, `react-router-dom`, raw SQL, `salaryMinUSD`, `jobType` for location, disk multer, hardcoded secrets) — details `/security-check` mein.
- Prisma singleton `db.js` se import (naya `PrismaClient` nahi)
- Redis singleton `redis.js` se
- Naming/field conventions (`locationType`, camelCase, etc.)

### 4. Code Quality
- Duplication — reuse ho sakta tha?
- Naming saaf hai? Surrounding code ke style se match?
- Zaroori se zyada complexity? Simplify ho sakta hai?
- Zod validation har input pe?
- Kahin `console.log`/debug reh gaya (Winston `logger` use hona chahiye)?

### 5. Performance (is scale pe, over-engineer nahi)
- N+1 queries, missing `await`, batch ho sakne wale inserts
- Zaroori indexes (eligibility filter, matchScore sort)

## Output
- Findings ki list, **sab se serious upar**. Har ek: `file:line` — kya masla — kyun — kaise theek karein.
- Severity de: 🔴 bug/blocker, 🟡 should-fix, 🟢 nit.
- Kuch serious na ho to saaf kaho — chhoti chhoti cheezein bana ke report mat karo.
- Fixes khud apply mat karo; user chahe to peshkash karo (ya woh `/code-review --fix` use kar sakta hai).

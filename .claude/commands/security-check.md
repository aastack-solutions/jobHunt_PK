---
description: Current changes ko project ke security + architecture rules ke against audit karo
argument-hint: (optional) file ya area
allowed-tools: Bash(git:*), Grep, Glob, Read
---

Tum JobHunt PK ke code ka **security + rules audit** kar rahe ho. Yeh review-only hai — code change mat karo jab tak user na kahe.

## Kya check karna hai

Pehle `git diff` (aur staged changes) dekho. Agar `$ARGUMENTS` diya hai to us file/area pe focus karo. Har finding ko severity (🔴 high / 🟡 medium / 🟢 low) ke saath report karo.

### 1. Absolute Prohibitions (CLAUDE.md se — koi bhi mile to 🔴)
- `ioredis` (sirf `redis@4.7.1`), `cors` middleware, `jsonwebtoken`, `react-router-dom`, `json2csv`, `diskStorage` in multer
- Raw SQL / string-interpolated queries (sirf Prisma parameterized)
- `salaryMinUSD` / `salaryMaxUSD` fields (match ke waqt compute)
- Location ke liye `jobType` (sirf `locationType`)
- Hardcoded secrets / API keys / passwords
- Production API response mein stack trace / error `.stack` leak
- Public signup / payment / SaaS feature

### 2. Auth & Data Security
- Passwords: bcrypt hashed, kabhi plain log nahi
- Login errors generic ("Invalid credentials") — email existence reveal na ho
- Session cookie: `httpOnly`, `sameSite=strict`, prod mein `secure`
- Har input Zod se validate hota hai DB tak pohonchne se pehle
- File upload: content-type se validate (magic bytes), filename se nahi
- Resume parser sirf `INTERNAL_SECRET` header se reachable

### 3. Karachi/Remote Hard Filter
- Onsite/Hybrid job sirf Karachi + user opt-in pe eligible
- Yeh check scoring se **pehle** hona chahiye (hard filter, weighted factor nahi)

### 4. Secrets Hygiene
- `.env` git mein na ho (`.gitignore` check karo)
- Naye secrets env vars se aayein, code se nahi

## Output
- Findings ki list, sab se serious upar. Har ek: file:line, kya galat hai, kaise theek karein.
- Kuch na mile to saaf kaho "✅ Koi rule violation nahi mila" — jhoota clean report mat do.
- Agar user chahe to fixes apply karne ki peshkash karo (khud se mat karo).

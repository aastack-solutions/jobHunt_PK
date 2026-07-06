# HOW TO RUN — JobHunt PK (Local Development)

> Yeh file local machine (Windows) pe project chalane ka tareeqa aur zaroori rules/security notes rakhti hai.
> Aage jaise jaise kaam barhega, rules aur security points isi file mein add hote rahenge.

---

## 1. Ek Nazar Mein (TL;DR)

Rozana bas ek command:

```powershell
cd C:\Users\admin\Music\salesrep\jobHunt_PK\backend
npm run dev
```

PostgreSQL aur Redis **Windows services** hain — PC on hote hi khud chalte hain, manually start nahi karna.

Test: browser mein <http://localhost:5000/health> → `{"status":"ok","service":"backend"}`

---

## 2. Services (Database + Redis) — Automatic

| Service | Windows Service Name | Address | Manual chahiye? |
|---------|---------------------|---------|-----------------|
| PostgreSQL 17 | `postgresql-x64-17` | `localhost:5432` | ❌ Auto-start |
| Redis (Memurai) | `Memurai` | `localhost:6379` | ❌ Auto-start |

Status check:
```powershell
Get-Service postgresql-x64-17, Memurai
```
Agar kabhi `Stopped` ho:
```powershell
Start-Service postgresql-x64-17, Memurai
```

**Local DB credentials:** db `jobhuntpk`, user `postgres`, password `postgres` (sirf local dev ke liye).

---

## 3. Backend (zaroori)

```powershell
cd C:\Users\admin\Music\salesrep\jobHunt_PK\backend
npm run dev        # development (auto-restart on code change)
# ya
npm start          # plain start
```
- Ready hone ka signal: `Backend listening on port 5000` + `Redis connected`
- Band karna: terminal mein `Ctrl + C`
- Port: **5000**

### Pehli dafa / DB reset ke baad
```powershell
npm install                 # dependencies (sirf ek dafa)
npx prisma generate         # Prisma client
npx prisma migrate deploy   # tables banao
```

---

## 4. Frontend (optional — UI ke liye)

Alag terminal:
```powershell
cd C:\Users\admin\Music\salesrep\jobHunt_PK\frontend
npm run dev        # http://localhost:5173
```
Login/signup real backend se chalte hain; Jobs/Applications/Dashboard abhi **mock data** pe hain (Week 3+ mein real honge).

---

## 5. Resume Parser (optional — resume upload test ke liye)

Alag terminal:
```powershell
cd C:\Users\admin\Music\salesrep\jobHunt_PK\resume-parser
pip install -r requirements.txt
uvicorn main:app --port 8000
```

---

## 6. Quick Test Commands

```powershell
# Health (DB + Redis ping)
Invoke-RestMethod http://localhost:5000/health

# Register
$b = @{ email="test@test.com"; password="password123"; fullName="Test" } | ConvertTo-Json
Invoke-RestMethod http://localhost:5000/api/auth/register -Method Post -Body $b -ContentType "application/json"

# Login
$l = @{ email="test@test.com"; password="password123" } | ConvertTo-Json
Invoke-RestMethod http://localhost:5000/api/auth/login -Method Post -Body $l -ContentType "application/json"
```

---

## 7. Rules & Security Notes (IMPORTANT — padhte rahein)

Yeh section project ke non-negotiable rules aur security ki baaton ke liye hai. (Tafseel `CLAUDE.md` aur `JobHuntPK_Spec` mein.)

### Secrets
- `.env` file **kabhi git mein commit nahi karni** — already `.gitignore` mein hai. Sirf `.env.example` commit hoti hai.
- Saare secrets (API keys, DB password) **environment variables** mein rahein, code mein hardcode nahi.
- ⚠️ **Downloads/env** wali file ke asli secrets (Groq, Brevo, R2, Railway DB) plain text mein expose ho chuke — production pe le jane se pehle **rotate (badal) karein.**

### Architecture (CLAUDE.md se — inko na todein)
- `ioredis` nahi → `redis@4.7.1`
- `cors` middleware nahi → same-origin (frontend backend ek domain)
- `jsonwebtoken` nahi → server-side Redis sessions
- `react-router-dom` nahi → `react-router@7`
- Raw SQL nahi → sirf Prisma (parameterized)
- Multer `diskStorage` nahi → memory storage, files R2 pe
- `salaryMinUSD` / `salaryMaxUSD` fields nahi → match ke waqt compute
- Location ke liye `jobType` nahi → `locationType` (Remote/Onsite/Hybrid)
- Production API responses mein stack trace leak nahi
- Public signup / payment / SaaS features nahi

### Auth Security (implement ho chuka ✅)
- Password `bcrypt` (cost 12) se hashed — kabhi plain text log nahi
- Login fail 10 dafa → email-based lockout 30 min (Redis)
- Galat login hamesha generic "Invalid credentials" — email exist karta hai ya nahi kabhi reveal nahi
- Session cookie: `httpOnly`, `sameSite=strict`, production mein `secure`
- File upload: content se validate hoti hai, filename se nahi; local disk pe permanently save nahi

### Karachi/Remote Rule (core business rule)
- Remote job kahin se bhi → sab ko dikh sakti hai (koi location check nahi)
- Onsite/Hybrid job **sirf Karachi** ki, aur sirf usko jisne opt-in kiya
- Yeh **hard filter** hai (scoring se pehle) — Karachi se bahar onsite job kisi ko match nahi hoti

---

## 7b. Job Fetching (Week 3)

Jobs har roz **05:00 UTC** khud fetch hote hain (BullMQ repeatable `daily-job-fetch`). Manually chalane ke liye (testing) — `CRON_SECRET` `.env` se lein:

```powershell
$cron = (Get-Content backend\.env | Select-String '^CRON_SECRET=').ToString().Split('=')[1]
Invoke-RestMethod http://localhost:5000/api/internal/trigger-fetch -Method Post -Headers @{ "X-Cron-Secret" = $cron }
# → { inserted, unique, fetched, sourceBreakdown }
```

- **Sources (live):** Remotive, Arbeitnow, Himalayas (free JSON APIs, no key).
- **Karachi sources:** scaffold ready par **disabled** — kisi source ke ToS/robots verify hone tak `jobFetcher.js` ke `KARACHI_SOURCES` mein `enabled:false`. Spec ke mutabiq restrict karne wale sources skip karne hain.
- **Dedup:** DB constraints se — `platform+externalId` aur `contentHash`. Dobara fetch pe duplicate skip (`inserted:0`).
- **Browse:** `GET /api/jobs` sirf woh jobs deta hai jinke liye user eligible hai (Remote → wantsRemote; Onsite/Hybrid → wantsOnsiteKarachi + city=karachi). `matchScore` Week 4 mein aayega.

---

## 8. Custom Agent Commands (`/` commands)

Yeh commands `.claude/commands/` mein hain — chat mein `/naam` likho, agent khud kaam kar dega. Har baar prompt repeat karne ki zaroorat nahi.

| Command | Kya karta hai |
|---------|--------------|
| `/test` | Backend ke smoke tests (health + register + login + galat password) chala ke table mein result deta hai |
| `/run` | Services check + backend start. `/run all` se frontend + parser bhi |
| `/review` | Poora code review — bugs, code quality, spec compliance, rules (`/review staged` ya file bhi de sakte ho) |
| `/security-check` | Current changes ko project ke security + architecture rules ke against audit karta hai |
| `/week-done 3` | Week 3 milestone verify + security audit + (confirm pe) commit |

> Naya command banana ho to `.claude/commands/<naam>.md` file banao — filename hi command ka naam ban jata hai. Body mein steps likho (Roman Urdu chalega). Frontmatter mein `description` aur `allowed-tools` de sakte ho.

### Rules kahan likhein? (3 jagah, 3 kaam)
- **`CLAUDE.md`** (har folder mein) → passive rules, har session khud load. "Yeh kabhi na karna." — Yahan architecture/security prohibitions rakho.
- **`.claude/commands/*.md`** → `/command` se chalne wale workflows.
- **`.claude/settings.json` (hooks)** → sach much automatic (e.g. commit se pehle test). Yeh harness chalata hai, AI ke bharose nahi.

---

## 9. Common Masle (Troubleshooting)

| Masla | Hal |
|-------|-----|
| `Non-existent domain` DB error | `.env` mein `railway.internal` URL hai — local ke liye `localhost` hona chahiye |
| Backend start nahi ho raha, DB error | `Get-Service postgresql-x64-17` → `Running` hai? nahi to `Start-Service` |
| `Redis error` / health fail | `Get-Service Memurai` → `Running` hai? |
| Port 5000 already in use | Purana backend chal raha hai — us terminal mein `Ctrl+C` ya process band karein |
| Migration error | `npx prisma migrate deploy` dobara; ya `npx prisma migrate reset` (⚠️ data delete) |

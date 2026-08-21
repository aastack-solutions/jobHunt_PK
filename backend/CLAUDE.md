# backend/CLAUDE.md

Rules for everything inside `backend/`. Read before touching any file here.

## Pinned Package Versions — No Upgrades Without Instruction

```json
"express": "5.2.1",         "compression": "1.8.1",
"helmet": "8.2.0",          "express-rate-limit": "8.5.2",
"express-session": "1.19.0","connect-redis": "9.0.0",
"redis": "4.7.1",           "bcrypt": "6.0.0",
"prisma": "7.8.0",          "@prisma/client": "7.8.0",
"bullmq": "5.79.1",         "zod": "4.4.3",
"multer": "2.2.0",          "@aws-sdk/client-s3": "3.1073.0",
"@aws-sdk/s3-request-presigner": "3.1073.0",
"groq-sdk": "1.3.0",        "nodemailer": "9.0.1",
"rss-parser": "3.13.0",     "cheerio": "1.2.0",
"axios": "1.18.1",          "winston": "3.19.0",
"dotenv": "17.4.2",         "@json2csv/plainjs": "7.0.6",
"ws": "8.18.0",             "cookie": "0.7.2",
"cookie-signature": "1.2.2"
```

`ws` (added 2026-08-17, F7 scaffold; wired in 2026-08-19): WebSocket proxy for the
apply-bot live-view feature (`routes/applyBotLive.js`) — the only place raw
WebSockets are used in this codebase; everything else stays REST.

`cookie` / `cookie-signature` (added 2026-08-19, F7): already-present transitive
dependencies of `express-session`, pinned explicitly now that `applyBotLive.js`
`require()`s them directly — a raw WS upgrade never runs through the `session`
middleware, so authenticating it means manually parsing and unsigning the session
cookie the same way `express-session` does internally, then looking it up against
the same Redis store (`connect-redis`'s `sess:` prefix).

## File Layout — Every File Has One Home

```
─── backend/ (Node.js — Express API) ────────────────────────────────
src/app.js                    ← Express setup, middleware, server.listen
src/redis.js                  ← Redis singleton (createClient, connect once)
src/db.js                     ← Prisma singleton (one instance, export it)
src/routes/auth.js            ← /api/auth/*
src/routes/jobs.js            ← /api/jobs
src/routes/applications.js    ← /api/applications
src/routes/resumes.js         ← /api/resumes
src/routes/interviews.js      ← /api/interviews
src/routes/users.js           ← /api/users/me/preferences
src/routes/ai.js              ← /api/ai/enqueue + /api/ai/status/:id
src/routes/internal.js        ← /api/internal/trigger-fetch
src/routes/health.js          ← /health
src/middleware/requireAuth.js ← session guard
src/middleware/rateLimiter.js ← authLimiter + apiLimiter
src/services/storageService.js   ← Cloudflare R2
src/services/emailService.js     ← Brevo SMTP
src/services/matchingEngine.js   ← isEligible() + calculateMatch()
src/services/currencyService.js  ← exchange rate, toUSD()
src/services/geocodingService.js ← Nominatim, haversine
src/services/jobFetcher.js       ← all platform fetchers + normalizeJob()
src/services/cityNormalizer.js   ← normalizeCity() + classifyLocationType()
src/services/logger.js           ← Winston instance (use this, not console.log)
src/queues/aiQueue.js            ← Queue ONLY — no Worker code here
src/workers/aiWorker.js          ← createAIWorker() — started in server.listen
src/workers/schedulerWorker.js   ← createSchedulerWorker() — started in server.listen
jobs/exchangeRateFetch.js        ← runExchangeRateFetch()
jobs/dailyJobFetch.js            ← runDailyJobFetch()
jobs/interviewReminders.js       ← runInterviewReminders()
jobs/weeklyCleanup.js            ← runWeeklyCleanup()
prisma/schema.prisma             ← all 8 table definitions + indexes
prisma/migrations/               ← auto-generated, never edit manually
package.json                     ← pinned Node.js dependencies
Dockerfile                       ← FROM node:22-alpine

─── resume-parser/ (Python 3.13 — FastAPI) ──────────────────────────
NOTE: This is a completely separate service from the Node.js backend.
It runs in its own Railway service, its own Docker container, and has
NO public URL. The backend calls it via railway.internal only.
Rules for this service are in resume-parser/CLAUDE.md.

main.py                          ← FastAPI app — POST /parse, GET /health
requirements.txt                 ← fastapi, uvicorn, pymupdf, python-docx, python-multipart
Dockerfile                       ← FROM python:3.13-slim
```

## app.js — Middleware Order Is Fixed

```javascript
app.use(compression())
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "https:"], objectSrc: ["'none'"],
}}, crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(session({ store: new RedisStore(...), ... }))
app.use(express.static(path.join(__dirname, '../public')))
app.use('/api/auth', authLimiter)
app.use('/api', apiLimiter)
// routes
app.get('/*path', serveReact)   // Express 5: named wildcard, NOT bare *
app.use(globalErrorHandler)     // always last
```

Workers start AFTER server binds:
```javascript
const server = app.listen(port, () => {
  const { createAIWorker } = require('./workers/aiWorker');
  const { createSchedulerWorker } = require('./workers/schedulerWorker');
  createAIWorker();
  createSchedulerWorker();
});
```

## Auth Rules

**Sessions (connect-redis@9 named export):**
```javascript
const { RedisStore } = require('connect-redis');  // named export, not .default
new RedisStore({ client: redisClient, prefix: 'sess:' })
cookie: { secure: true (prod), httpOnly: true, sameSite: 'strict', maxAge: 7days }
```

**Login lockout:**
- Redis key: `login_fail:{email}`
- Lock after: 10 failures from any IP
- Lock duration: 1800 seconds
- Clear on success: `DEL login_fail:{email}`
- Error message always: `"Invalid credentials"` — never reveal if email exists

**bcrypt cost factor: exactly 12** — not 10, not 14

## Security Rules

**Rate limiting (express-rate-limit@8 uses `limit` not `max`):**
```javascript
authLimiter: { limit: 5, windowMs: 15*60*1000, standardHeaders: 'draft-8' }
apiLimiter:  { limit: 100, windowMs: 60*1000, standardHeaders: 'draft-8' }
```

**Express 5 async errors are auto-caught — no try/catch + next(err):**
```javascript
// CORRECT
router.get('/jobs', requireAuth, async (req, res) => {
  const jobs = await prisma.job.findMany();
  res.json(jobs);
});
// WRONG — do not wrap in try/catch and call next(err)
```

**Express 5 wildcard routes — named wildcard required:**
```javascript
app.get('/*path', handler)   // CORRECT
app.get('*', handler)        // WRONG — invalid in Express 5
```

**Zod validation on every route that accepts input:**
```javascript
const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
```

## BullMQ Rules — Critical

**Workers NEVER in module scope — only inside server.listen().**
If a Worker starts at import time, Railway's zero-downtime deploy creates two workers → jobs run twice.

**Queue and Worker are separate files:**
- `queues/aiQueue.js` → exports Queue only
- `workers/aiWorker.js` → exports `createAIWorker()` only

**Repeatable jobs — never purge on startup:**
```javascript
// CORRECT — BullMQ deduplicates by jobId natively
await queue.add('daily-job-fetch', {}, { repeat: { pattern: '0 5 * * *', tz: 'UTC' }, jobId: 'daily-job-fetch' });
// WRONG — causes missed runs when server restarts near scheduled time
const jobs = await queue.getRepeatableJobs();
for (const j of jobs) await queue.removeRepeatableByKey(j.key);
```

**Scheduled times (UTC, fixed):**
- `exchange-rate-fetch` → 04:45 daily
- `daily-job-fetch` → 05:00 daily
- `apply-bot-select` → 05:15 daily (F12, wired 2026-08-21 — a few minutes after
  daily-job-fetch so selection reads a fully up-to-date `JobMatch` table; also
  runs the stale-task sweep and the failure report internally, see
  `jobs/applyBotSelect.js`)
- `interview-reminders` → 08:00 daily
- `weekly-cleanup` → 03:00 Sunday

**Exchange rate job retry (required):**
```javascript
{ attempts: 3, backoff: { type: 'exponential', delay: 30000 } }
// Retries at 04:45:30, 04:46:00, 04:47:00 — all before 05:00
```

**AI queue rate limit:**
```javascript
new Worker('ai-tasks', handler, { concurrency: 1, limiter: { max: 1, duration: 3000 } })
```

**Frontend polling timeout:** 60 polls × 2s = 2 minutes max, then show error.

**All jobs need 30s timeout:**
```javascript
defaultJobOptions: { timeout: 30000, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
```

## Job Fetching Rules

**Every fetcher returns `[]` on error — never throws:**
```javascript
async function fetchX() {
  try {
    const { data } = await axios.get(URL, { timeout: 10000 });
    if (!data?.jobs?.length) { logger.warn('X: 0 jobs'); return []; }
    return data.jobs.map(j => normalizeJob(j, 'x'));
  } catch (err) { logger.error(`X: ${err.message}`); return []; }
}
```

**All remote fetchers run in parallel: `Promise.allSettled()`**
**Karachi scraper fetchers run sequentially within each source with `LOCAL_FETCH_DELAY_MS` delay between pages**

**normalizeJob() must always set `expiresAt`:**
```javascript
expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)  // never rely on a DB default
```

**Batch insert only:**
```javascript
await prisma.job.createMany({ data: allJobs, skipDuplicates: true });
// Never loop with prisma.job.create()
```

**SchedulerLog after every fetch — include sourceBreakdown:**
```javascript
await prisma.schedulerLog.create({ data: {
  jobName: 'daily-job-fetch', status: 'completed',
  jobCount: result.count,
  sourceBreakdown: { remotive: 120, rozee: 0, mustakbil: 45 },
}});
```

## Currency Rules

**Never store pre-computed USD values. Compute at match time.**

```javascript
// currencyService.js
// Redis key: 'exchange_rate:PKR_USD' = JSON { rate, fetchedAt }
// TTL: 48 hours

async function toUSD(amount, currency, redisClient) {
  if (!amount) return null;
  if (currency === 'USD') return amount;
  const cached = await redisClient.get('exchange_rate:PKR_USD').catch(() => null);
  if (!cached) return null;  // fallback → caller uses neutral score 70
  const { rate, fetchedAt } = JSON.parse(cached);
  if ((Date.now() - fetchedAt) > 48 * 3600000) return null;
  return Math.round(amount / rate);
}
```

If `toUSD()` returns null → salary sub-score = 70 (neutral). Never skip scoring entirely.

## Location Rules

**normalizeCity() — always run raw strings through this:**
```javascript
const KARACHI = new Set(['karachi', 'khi', 'kar\u0101chi', 'karāchi']);
function normalizeCity(raw) {
  if (!raw) return null;
  const city = raw.toLowerCase().replace(/\(.*?\)/g,'').replace(/,.*$/,'').replace(/[^\w\s]/g,'').trim();
  return KARACHI.has(city) ? 'karachi' : city;
}
```

**classifyLocationType() — call for every job:**
```javascript
const REMOTE  = ['remote','wfh','work from home','fully remote','work remotely','distributed'];
const HYBRID  = ['hybrid','partial remote','partially remote','flexible work'];
const KHI_PLT = ['rozee','mustakbil','joblo'];
function classifyLocationType(title, desc, platform) {
  const t = `${title} ${desc}`.toLowerCase();
  if (REMOTE.some(k => t.includes(k))) return 'Remote';
  if (HYBRID.some(k => t.includes(k))) return 'Hybrid';
  if (KHI_PLT.includes(platform))      return 'Onsite';
  return 'Remote';
}
```

**isEligible() — runs BEFORE scoring:**
```javascript
function isEligible(job, user) {
  if (job.locationType === 'Remote') return user.wantsRemote === true;
  if (job.locationType === 'Onsite' || job.locationType === 'Hybrid')
    return user.wantsOnsiteKarachi === true && job.city === 'karachi';
  return false;
}
```

**Delta matching — new jobs only after each fetch:**
```javascript
const ts = await redisClient.get('last_match_run');
const newJobs = await prisma.job.findMany({
  where: { isActive: true, fetchedAt: ts ? { gt: new Date(parseInt(ts)) } : undefined }
});
await redisClient.set('last_match_run', Date.now().toString());
// Full re-match only when user updates resume or preferences
```

## Matching Algorithm — Exact Values

```
Final = (Skill × 0.55) + (Experience × 0.30) + (Salary × 0.15)

Skill:      no user skills→0(warn) | no job skills→60 | else (matched/total)×100
Experience: none found→70 | meets→100 | 1yr short→75 | 2yr→50 | 3+yr→max(10,declining)
Salary:     unknown→70 | job≥user→100 | ≤10%→80 | ≤25%→55 | ≤40%→35 | >40%off→15
Labels:     85-100=Excellent | 70-84=Good | 50-69=Fair | 0-49=Low
```

Both salaries converted to USD before comparison. If rate unavailable → salary = 70 (neutral).

## AI (Groq) Rules

- Model: `llama3-8b-8192` only
- Cover letter: `max_tokens: 450, temperature: 0.7`
- Job summary: `max_tokens: 120, temperature: 0.2`
- Interview prep: `max_tokens: 220, temperature: 0.5`
- Never call Groq directly from a route — always enqueue via `aiQueue.js`

## Email Rules

**Brevo only** — `smtp-relay.brevo.com:587`

**escapeHtml() on ALL dynamic values in email templates:**
```javascript
function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```

**Map link needs TWO separate escaping operations:**
```javascript
const mapHref = `https://maps.google.com/?q=${encodeURIComponent(interview.officeAddress)}`;
const mapText = escapeHtml(interview.officeAddress);
// <a href="${mapHref}">${mapText}</a>
```

**Digest respects preferences:**
```
both true  → Top 5 Remote + Top 5 Karachi
remote only → Top 10 Remote
karachi only → Top 10 Karachi
neither    → send nothing
```

## File Storage (R2) Rules

- `multer({ storage: multer.memoryStorage() })` — never diskStorage
- Files exist in memory buffer only before upload to R2
- Downloads: signed URLs only, `expiresIn: 3600` (1 hour)
- R2 key format: `resumes/{userId}/{timestamp}-{uuid}.{ext}`

## Health Check

```javascript
router.get('/', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  await redisClient.ping();
  res.json({ status: 'ok', service: 'backend' });
});
```

Must ping both DB and Redis — Railway uses this to confirm deployments.

## Environment Variables

Required at startup — fail loudly if missing:
```
DATABASE_URL (append ?connection_limit=10&pool_timeout=20)
REDIS_URL, SESSION_SECRET, NODE_ENV=production
GROQ_API_KEY, BREVO_SMTP_USER, BREVO_SMTP_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
INTERNAL_SECRET, CRON_SECRET
NOMINATIM_USER_AGENT (e.g. "JobHuntPK/1.0 contact@team.com")
LOCAL_FETCH_DELAY_MS=2000
ADZUNA_APP_ID, ADZUNA_APP_KEY, FINDWORK_API_KEY, THEMUSE_API_KEY, JOOBLE_API_KEY
```

Add startup validation — if any required var is missing, throw with a clear error message before the server starts.

## Railway Deployment

```
Root directory:   /   (monorepo root — NOT /backend)
Build command:    cd frontend && npm ci && npm run build && cd ../backend && npm ci && npx prisma generate
Start command:    cd backend && npx prisma migrate deploy && node src/app.js
Health check:     /health
NODE_VERSION:     22
```
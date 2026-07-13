// services/jobFetcher.js — all platform fetchers + normalizeJob() + fetchAllJobs().
//
// Rules (backend/CLAUDE.md):
//  - Every fetcher returns [] on error, never throws.
//  - Remote fetchers run in parallel (Promise.allSettled).
//  - Karachi scraper fetchers run sequentially with LOCAL_FETCH_DELAY_MS between requests.
//  - normalizeJob() always sets expiresAt (never a DB default).
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const RssParser = require('rss-parser');
const logger = require('../logger');
const { normalizeCity, classifyLocationType } = require('./cityNormalizer');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 10000;

// Canonical skill vocabulary — MUST mirror resume-parser/main.py SKILLS so that
// job skills and resume skills share one vocabulary; the matching engine compares
// them by exact (lowercased) set overlap, so both sides have to speak the same list.
const SKILLS = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'golang',
  'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'dart', 'elixir',
  'bash', 'sql', 'html', 'css', 'sass',
  // Frontend
  'react', 'next.js', 'vue', 'nuxt', 'angular', 'svelte', 'redux', 'tailwind',
  'tailwind css', 'bootstrap', 'vite', 'webpack', 'jquery',
  // Backend
  'node.js', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring',
  'spring boot', 'laravel', 'rails', 'ruby on rails', 'graphql', 'rest',
  'rest apis', 'grpc', 'prisma', 'sequelize',
  // Databases
  'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
  'elasticsearch', 'cassandra', 'dynamodb', 'firebase', 'supabase',
  // Cloud / DevOps
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform',
  'ansible', 'jenkins', 'github actions', 'gitlab ci', 'ci/cd', 'nginx',
  'linux', 'bullmq', 'rabbitmq', 'kafka',
  // AI / ML
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'keras',
  'scikit-learn', 'pandas', 'numpy', 'nlp', 'opencv', 'llm',
  // Mobile
  'react native', 'flutter', 'android', 'ios', 'xamarin',
  // Design
  'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator', 'ui/ux',
  // Tools
  'git', 'jira', 'jest', 'cypress', 'playwright', 'postman', 'agile', 'scrum',
  // --- Extended vocabulary: captures a job's true stack so unrelated roles score
  // low instead of matching on one incidental keyword (e.g. a Unity/game job) ---
  // Games / graphics
  'unity', 'unreal', 'godot', 'opengl', 'webgl', '3d',
  // .NET / Microsoft
  '.net', 'asp.net', 'blazor', 'wpf', 'sharepoint', 'dynamics',
  // Languages
  'objective-c', 'perl', 'lua', 'matlab', 'solidity', 'clojure', 'haskell',
  'groovy', 'cobol', 'visual basic', 'vba', 'assembly',
  // Backend / web
  'symfony', 'codeigniter', 'fastify', 'deno', 'phoenix',
  // Data / ML
  'spark', 'hadoop', 'airflow', 'snowflake', 'databricks', 'tableau',
  'power bi', 'hive', 'langchain', 'spacy', 'matplotlib', 'hugging face',
  // Cloud
  'cloudflare', 'vercel', 'netlify', 'heroku', 'openshift', 'helm',
  // Mobile
  'swiftui', 'ionic', 'cordova',
  // CMS / commerce
  'wordpress', 'shopify', 'magento', 'drupal', 'woocommerce', 'contentful', 'strapi',
  // Enterprise
  'salesforce', 'sap', 'servicenow', 'workday',
  // Testing
  'selenium', 'storybook', 'puppeteer', 'mocha', 'vitest', 'rspec', 'cucumber',
];
const SKILL_SET = new Set(SKILLS);
// Token-boundary regex per skill (not \b — that mishandles c++, c#, node.js, ci/cd).
// A skill matches only when not glued to another alphanumeric char on either side.
const SKILL_MATCHERS = SKILLS.map((s) => ({
  skill: s,
  re: new RegExp(`(?<![a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`),
}));

// Extract canonical skills from free text (job title + description).
function extractSkills(text) {
  if (!text) return [];
  const t = String(text).toLowerCase();
  const out = [];
  for (const { skill, re } of SKILL_MATCHERS) if (re.test(t)) out.push(skill);
  return out;
}

// Job skills for matching: canonical skills found in the title/description, unioned
// with any source tags that are already in the canonical vocabulary. Noisy source
// tags (e.g. "accounting", "CRM") are dropped so skill overlap stays meaningful.
function deriveSkills(title, description, rawTags) {
  const fromText = extractSkills(`${title} ${description}`);
  const fromTags = (Array.isArray(rawTags) ? rawTags : [])
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => SKILL_SET.has(s));
  return [...new Set([...fromText, ...fromTags])].slice(0, 30);
}

function stripHtml(html) {
  if (!html) return '';
  try {
    return cheerio.load(html).text().replace(/\s+/g, ' ').trim().slice(0, 5000);
  } catch {
    return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Content fingerprint — same job across boards collapses to one row.
function contentHash(company, title, description) {
  const basis = `${company || ''}|${title || ''}|${(description || '').slice(0, 200)}`.toLowerCase();
  return crypto.createHash('sha1').update(basis).digest('hex');
}

// Cross-cutting finalize: classify location, normalize city, fingerprint, expiry.
// Returns null when a required field (title/company/applyUrl) is missing.
function normalizeJob(m, platform, locationHint = null) {
  const title = (m.title || '').trim();
  const company = (m.company || '').trim();
  const applyUrl = (m.applyUrl || '').trim();
  if (!title || !company || !applyUrl) return null;

  const description = stripHtml(m.description);

  // remote-strict: general boards (Adzuna/Jooble) also return onsite jobs — keep
  // only ones with an explicit remote/hybrid signal so they don't fall through to
  // the classifier's default 'Remote' and pollute the remote pool.
  if (
    locationHint === 'remote-strict' &&
    !/\b(remote|wfh|work from home|work remotely|distributed|hybrid)\b/i.test(`${title} ${description}`)
  ) {
    return null;
  }

  let locationType = classifyLocationType(title, description, platform);
  // A Karachi-scoped source with no remote signal is an onsite role.
  if (locationHint === 'karachi' && locationType === 'Remote') locationType = 'Onsite';
  // City only matters for Onsite/Hybrid; Remote jobs carry no city.
  const city = locationType === 'Remote' ? null : normalizeCity(m.rawLocation);

  return {
    externalId: m.externalId != null ? String(m.externalId) : null,
    contentHash: contentHash(company, title, description),
    platform,
    title: title.slice(0, 300),
    company: company.slice(0, 200),
    description,
    locationType,
    employmentType: m.employmentType ? String(m.employmentType) : null,
    city,
    rawLocation: m.rawLocation ? String(m.rawLocation).slice(0, 300) : null,
    salaryMin: Number.isInteger(m.salaryMin) ? m.salaryMin : null,
    salaryMax: Number.isInteger(m.salaryMax) ? m.salaryMax : null,
    salaryCurrency: m.salaryCurrency || 'USD',
    skills: deriveSkills(title, description, m.skills),
    applyUrl,
    postedAt: toDate(m.postedAt),
    expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
  };
}

// ---------------- Remote sources (free JSON APIs, no key) ----------------

async function fetchRemotive() {
  try {
    const { data } = await axios.get('https://remotive.com/api/remote-jobs?limit=50', { timeout: REQUEST_TIMEOUT });
    const jobs = data?.jobs || [];
    if (!jobs.length) { logger.warn('remotive: 0 jobs'); return []; }
    return jobs
      .map((j) => normalizeJob({
        externalId: j.id,
        title: j.title,
        company: j.company_name,
        description: j.description,
        rawLocation: j.candidate_required_location,
        employmentType: j.job_type,
        skills: j.tags,
        applyUrl: j.url,
        postedAt: j.publication_date,
      }, 'remotive'))
      .filter(Boolean);
  } catch (err) { logger.error(`remotive: ${err.message}`); return []; }
}

async function fetchArbeitnow() {
  try {
    const { data } = await axios.get('https://www.arbeitnow.com/api/job-board-api', { timeout: REQUEST_TIMEOUT });
    const jobs = data?.data || [];
    if (!jobs.length) { logger.warn('arbeitnow: 0 jobs'); return []; }
    return jobs
      .map((j) => normalizeJob({
        externalId: j.slug,
        title: j.title,
        company: j.company_name,
        description: j.description,
        rawLocation: j.location,
        employmentType: Array.isArray(j.job_types) ? j.job_types[0] : null,
        skills: j.tags,
        applyUrl: j.url,
        // arbeitnow created_at is unix seconds
        postedAt: j.created_at ? j.created_at * 1000 : null,
      }, 'arbeitnow'))
      .filter(Boolean);
  } catch (err) { logger.error(`arbeitnow: ${err.message}`); return []; }
}

async function fetchHimalayas() {
  try {
    const { data } = await axios.get('https://himalayas.app/jobs/api?limit=50', { timeout: REQUEST_TIMEOUT });
    const jobs = data?.jobs || [];
    if (!jobs.length) { logger.warn('himalayas: 0 jobs'); return []; }
    return jobs
      .map((j) => normalizeJob({
        externalId: j.guid || j.id,
        title: j.title,
        company: j.companyName || j.company_name,
        description: j.description || j.excerpt,
        rawLocation: Array.isArray(j.locationRestrictions) ? j.locationRestrictions.join(', ') : null,
        employmentType: Array.isArray(j.employmentType) ? j.employmentType[0] : null,
        skills: j.categories,
        applyUrl: j.applicationLink || j.url,
        postedAt: j.pubDate ? j.pubDate * 1000 : null,
      }, 'himalayas'))
      .filter(Boolean);
  } catch (err) { logger.error(`himalayas: ${err.message}`); return []; }
}

// Adzuna — general job board (no Pakistan coverage). Used as an extra REMOTE
// source: query supported countries with what=remote, then remote-strict keeps
// only genuinely remote roles. Inactive until ADZUNA_APP_ID/KEY are set.
async function fetchAdzunaRemote() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) { logger.warn('adzuna: keys not set — skipped'); return []; }
  const countries = ['gb', 'us'];
  const out = [];
  for (const cc of countries) {
    try {
      const url =
        `https://api.adzuna.com/v1/api/jobs/${cc}/search/1?app_id=${encodeURIComponent(appId)}` +
        `&app_key=${encodeURIComponent(appKey)}&results_per_page=50&what=remote&content-type=application/json`;
      const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
      const results = data?.results || [];
      // Salary omitted on purpose: gb/us quote GBP/USD and we only normalize
      // PKR<->USD, so leaving it null yields the neutral salary sub-score.
      out.push(...results
        .map((j) => normalizeJob({
          externalId: j.id,
          title: j.title,
          company: j.company?.display_name,
          description: j.description,
          rawLocation: j.location?.display_name,
          employmentType: j.contract_time || j.contract_type || null,
          skills: j.category?.label ? [j.category.label] : [],
          applyUrl: j.redirect_url,
          postedAt: j.created,
        }, 'adzuna', 'remote-strict'))
        .filter(Boolean));
    } catch (err) { logger.error(`adzuna ${cc}: ${err.message}`); }
  }
  return out;
}

// Jooble — global aggregator (no Pakistan data). Used as an extra REMOTE source:
// search "remote", then remote-strict drops the onsite results it also returns.
async function fetchJoobleRemote() {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) { logger.warn('jooble: key not set — skipped'); return []; }
  try {
    const { data } = await axios.post(
      `https://jooble.org/api/${key}`,
      { keywords: 'remote developer', page: '1' },
      { timeout: REQUEST_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
    );
    const jobs = data?.jobs || [];
    return jobs
      .map((j) => normalizeJob({
        externalId: j.id,
        title: j.title,
        company: j.company,
        description: j.snippet,
        rawLocation: j.location,
        employmentType: j.type,
        applyUrl: j.link,
        postedAt: j.updated,
      }, 'jooble', 'remote-strict'))
      .filter(Boolean);
  } catch (err) { logger.error(`jooble: ${err.message}`); return []; }
}

// RemoteOK — public JSON API of remote jobs (no key). The first array element is a
// legal/metadata object (not a job), so it's dropped. A descriptive User-Agent is
// required or the endpoint blocks the request. ToS asks for attribution (kept in README).
async function fetchRemoteOK() {
  try {
    const { data } = await axios.get('https://remoteok.com/api', {
      timeout: REQUEST_TIMEOUT,
      headers: { 'User-Agent': SCRAPER_UA, Accept: 'application/json' },
    });
    const rows = Array.isArray(data) ? data.slice(1) : []; // element 0 is metadata
    if (!rows.length) { logger.warn('remoteok: 0 jobs'); return []; }
    return rows
      .map((j) => normalizeJob({
        externalId: j.id || j.slug,
        title: j.position,
        company: j.company,
        description: j.description,
        rawLocation: j.location,
        skills: j.tags,
        salaryMin: j.salary_min > 0 ? j.salary_min : null,
        salaryMax: j.salary_max > 0 ? j.salary_max : null,
        salaryCurrency: 'USD',
        applyUrl: j.apply_url || j.url,
        postedAt: j.date,
      }, 'remoteok'))
      .filter(Boolean);
  } catch (err) { logger.error(`remoteok: ${err.message}`); return []; }
}

// We Work Remotely — official RSS feed (no scraping, no key). Item titles arrive as
// "Company: Job Title", so we split on the first ": " to recover the company name.
async function fetchWeWorkRemotely() {
  try {
    const parser = new RssParser({ timeout: REQUEST_TIMEOUT, headers: { 'User-Agent': SCRAPER_UA } });
    const feed = await parser.parseURL('https://weworkremotely.com/remote-jobs.rss');
    const items = feed?.items || [];
    if (!items.length) { logger.warn('weworkremotely: 0 jobs'); return []; }
    return items
      .map((it) => {
        const raw = (it.title || '').trim();
        const sep = raw.indexOf(': ');
        const company = sep > 0 ? raw.slice(0, sep).trim() : '';
        const title = sep > 0 ? raw.slice(sep + 2).trim() : raw;
        return normalizeJob({
          externalId: it.guid || it.link,
          title,
          company,
          description: it.contentSnippet || it.content || '',
          rawLocation: Array.isArray(it.categories) ? it.categories.join(', ') : null,
          skills: it.categories,
          applyUrl: it.link,
          postedAt: it.isoDate || it.pubDate,
        }, 'weworkremotely');
      })
      .filter(Boolean);
  } catch (err) { logger.error(`weworkremotely: ${err.message}`); return []; }
}

// JSearch (RapidAPI) — aggregates many boards via Google for Jobs. The free tier is
// quota-limited (~200 requests/month), so we make ONE query per fetch. v5 uses the
// /search-v2 endpoint and nests results under data.jobs; we keep only remote roles.
// Inactive until RAPIDAPI_KEY is set (skips gracefully like Adzuna/Jooble).
async function fetchJSearch() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) { logger.warn('jsearch: RAPIDAPI_KEY not set — skipped'); return []; }
  try {
    const { data } = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
      timeout: REQUEST_TIMEOUT,
      params: { query: 'remote developer', num_pages: '1', country: 'us', date_posted: 'week' },
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
    });
    // v5 nests jobs under data.jobs; older versions returned data as the array.
    const rows = data?.data?.jobs || (Array.isArray(data?.data) ? data.data : []);
    const jobs = rows.filter((j) => j.job_is_remote !== false); // drop stray onsite roles
    if (!jobs.length) { logger.warn('jsearch: 0 jobs'); return []; }
    return jobs
      .map((j) => normalizeJob({
        externalId: j.job_id,
        title: j.job_title,
        company: j.employer_name,
        description: j.job_description,
        rawLocation: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || null,
        employmentType: j.job_employment_type,
        salaryMin: Number.isFinite(j.job_min_salary) ? Math.round(j.job_min_salary) : null,
        salaryMax: Number.isFinite(j.job_max_salary) ? Math.round(j.job_max_salary) : null,
        salaryCurrency: j.job_salary_currency || 'USD',
        applyUrl: j.job_apply_link,
        postedAt: j.job_posted_at_timestamp ? j.job_posted_at_timestamp * 1000 : null,
      }, 'jsearch'))
      .filter(Boolean);
  } catch (err) { logger.error(`jsearch: ${err.message}`); return []; }
}

// ---------------- ATS boards (per-company public JSON, no key) ----------------
//
// Each ATS exposes a public jobs endpoint per company. There is no "all jobs" call,
// so we keep a curated list of remote-hiring companies and query each. These boards
// list onsite roles too, so we keep only the ones flagged/located remote (Remote pool).
// Add slugs to any list below to expand coverage — verified live before shipping.
const GREENHOUSE_BOARDS = [
  'airbnb', 'stripe', 'coinbase', 'databricks', 'reddit', 'discord', 'asana',
  'cloudflare', 'gitlab', 'dropbox', 'instacart', 'gusto', 'samsara', 'affirm',
  'vercel', 'postman',
];
const LEVER_BOARDS = ['spotify']; // Lever customer slugs (extensible)
const WORKABLE_BOARDS = []; // Workable account subdomains with active public jobs (add verified slugs)

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Greenhouse — boards-api.greenhouse.io. `content=true` includes the HTML description
// (stripHtml handles it). location.name carries the remote signal.
async function fetchGreenhouseBoards() {
  const out = [];
  await Promise.all(GREENHOUSE_BOARDS.map(async (board) => {
    try {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
        { timeout: 15000 }
      );
      for (const j of data?.jobs || []) {
        const loc = j.location?.name || '';
        if (!/remote|anywhere|distributed/i.test(loc)) continue; // Remote pool only
        const norm = normalizeJob({
          externalId: `gh_${board}_${j.id}`,
          title: j.title,
          company: cap(board),
          description: j.content,
          rawLocation: loc,
          applyUrl: j.absolute_url,
          postedAt: j.updated_at,
        }, 'greenhouse');
        if (norm) out.push(norm);
      }
    } catch (err) { logger.error(`greenhouse ${board}: ${err.message}`); }
  }));
  return out;
}

// Lever — api.lever.co/v0/postings. workplaceType flags remote directly.
async function fetchLeverBoards() {
  const out = [];
  await Promise.all(LEVER_BOARDS.map(async (board) => {
    try {
      const { data } = await axios.get(`https://api.lever.co/v0/postings/${board}?mode=json`, { timeout: REQUEST_TIMEOUT });
      for (const j of Array.isArray(data) ? data : []) {
        const locTxt = j.categories?.location || '';
        if ((j.workplaceType || '').toLowerCase() !== 'remote' && !/remote/i.test(locTxt)) continue;
        const norm = normalizeJob({
          externalId: `lever_${board}_${j.id}`,
          title: j.text,
          company: cap(board),
          description: j.descriptionPlain || j.description || '',
          rawLocation: locTxt,
          employmentType: j.categories?.commitment,
          applyUrl: j.applyUrl || j.hostedUrl,
          postedAt: j.createdAt, // ms epoch
        }, 'lever');
        if (norm) out.push(norm);
      }
    } catch (err) { logger.error(`lever ${board}: ${err.message}`); }
  }));
  return out;
}

// Workable — apply.workable.com widget API. Inactive until WORKABLE_BOARDS has slugs
// with active public jobs (endpoint is public and returns 200; only the account list
// needs seeding, like the key-gated sources).
async function fetchWorkableBoards() {
  const out = [];
  await Promise.all(WORKABLE_BOARDS.map(async (account) => {
    try {
      const { data } = await axios.get(`https://apply.workable.com/api/v1/widget/accounts/${account}?details=true`, { timeout: REQUEST_TIMEOUT });
      const name = data?.name || cap(account);
      for (const j of data?.jobs || []) {
        const locTxt = j.location?.location_str || [j.city, j.country].filter(Boolean).join(', ') || '';
        if (!(j.remote || j.telecommuting || /remote/i.test(locTxt))) continue;
        const norm = normalizeJob({
          externalId: `wk_${account}_${j.shortcode || j.id}`,
          title: j.title,
          company: name,
          description: j.description || '',
          rawLocation: locTxt,
          applyUrl: j.url || j.application_url || j.shortlink,
          postedAt: j.published_on || j.created_at,
        }, 'workable');
        if (norm) out.push(norm);
      }
    } catch (err) { logger.error(`workable ${account}: ${err.message}`); }
  }));
  return out;
}

// ---------------- Karachi onsite source ----------------
//
// Mustakbil's Karachi listing is server-rendered (job cards are in the initial
// HTML, no JS needed) and its robots.txt allows generic clients on job pages, so
// a single polite request per fetch is within bounds. We use a descriptive UA and
// only hit the listing page (not 60 detail pages). Rozee is intentionally NOT
// scraped: it returns 403 to bots (active anti-bot), and the spec says skip such
// sources rather than work around them.
const MUSTAKBIL_URL = 'https://www.mustakbil.com/jobs/pakistan/karachi';
const SCRAPER_UA = 'Mozilla/5.0 (compatible; JobHuntPK/1.0; +https://github.com/aastack-solutions/jobHunt_PK)';

async function fetchMustakbilKarachi() {
  try {
    const { data: html } = await axios.get(MUSTAKBIL_URL, {
      timeout: REQUEST_TIMEOUT,
      headers: { 'User-Agent': SCRAPER_UA },
    });
    const $ = cheerio.load(html);
    const out = [];
    const seen = new Set();
    $('a[href*="/jobs/job/"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href || !title || title.length < 3 || seen.has(href)) return;
      seen.add(href);
      const idMatch = href.match(/\/jobs\/job\/(\d+)/);
      // Card text renders as "TITLE business COMPANY place LOCATION" (icon ligatures).
      const card = $(el).closest('div,li,article').text().replace(/\s+/g, ' ').trim();
      // Strip the title prefix first, then split on the lowercase Material-icon
      // ligatures "business"/"place" (case-sensitive so a title like "Business
      // Development…" doesn't match the company marker).
      const rest = card.startsWith(title) ? card.slice(title.length) : card;
      const m = rest.match(/business(.+?)place(.+)/);
      const company = (m && m[1].trim()) || 'Unknown';
      const rawLocation = (m && m[2].trim()) || 'Karachi, Pakistan';
      const job = normalizeJob(
        {
          externalId: idMatch ? idMatch[1] : null,
          title,
          company,
          description: '',
          rawLocation,
          applyUrl: `https://www.mustakbil.com${href}`,
        },
        'mustakbil',
        'karachi'
      );
      if (job) out.push(job);
    });
    if (!out.length) logger.warn('mustakbil: 0 jobs (page structure may have changed)');
    return out;
  } catch (err) {
    logger.error(`mustakbil: ${err.message}`);
    return [];
  }
}

// Additional scraper sources can be added here (sequential, polite, ToS-checked).
const KARACHI_SOURCES = [];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchKarachiSources() {
  const out = [];
  const delayMs = parseInt(process.env.LOCAL_FETCH_DELAY_MS || '2000', 10);
  for (const src of KARACHI_SOURCES) {
    if (!src.enabled) { logger.warn(`${src.platform}: disabled until ToS/robots verified`); continue; }
    try {
      const { data: html } = await axios.get(src.listUrl, {
        timeout: REQUEST_TIMEOUT,
        headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'JobHuntPK/1.0' },
      });
      const raw = src.parse(cheerio.load(html)) || [];
      out.push(...raw.map((m) => normalizeJob(m, src.platform)).filter(Boolean));
      await delay(delayMs);
    } catch (err) { logger.error(`${src.platform}: ${err.message}`); }
  }
  return out;
}

// ---------------- Orchestrator ----------------

async function fetchAllJobs() {
  // API-backed remote sources run in parallel.
  const apiFetchers = [
    fetchRemotive, fetchArbeitnow, fetchHimalayas, fetchAdzunaRemote, fetchJoobleRemote,
    fetchRemoteOK, fetchWeWorkRemotely, fetchJSearch,
    fetchGreenhouseBoards, fetchLeverBoards, fetchWorkableBoards,
  ];
  const settled = await Promise.allSettled(apiFetchers.map((fn) => fn()));
  const fromApis = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // Karachi onsite scraper(s) run sequentially with a polite delay.
  const mustakbil = await fetchMustakbilKarachi();
  const fromScrapers = await fetchKarachiSources();
  const jobs = [...fromApis, ...mustakbil, ...fromScrapers];

  const sourceBreakdown = {};
  for (const j of jobs) sourceBreakdown[j.platform] = (sourceBreakdown[j.platform] || 0) + 1;

  return { jobs, sourceBreakdown };
}

module.exports = { fetchAllJobs, normalizeJob, extractSkills, deriveSkills };

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
const logger = require('../logger');
const { normalizeCity, classifyLocationType } = require('./cityNormalizer');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 10000;

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
  let locationType = classifyLocationType(title, description, platform);
  // A Karachi-scoped source (e.g. Adzuna where=Karachi) with no remote signal is
  // an onsite role — override the classifier's default Remote.
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
    skills: Array.isArray(m.skills) ? m.skills.filter(Boolean).map(String).slice(0, 30) : [],
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

// Adzuna Pakistan API — official free-tier source for Karachi onsite/hybrid roles.
// Structured JSON, no scraping. Inactive until ADZUNA_APP_ID/KEY are set (free
// signup at https://developer.adzuna.com). where=Karachi scopes results to the city.
async function fetchAdzunaKarachi() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    logger.warn('adzuna: ADZUNA_APP_ID/KEY not set — Karachi source inactive');
    return [];
  }
  try {
    const url =
      `https://api.adzuna.com/v1/api/jobs/pk/search/1?app_id=${encodeURIComponent(appId)}` +
      `&app_key=${encodeURIComponent(appKey)}&results_per_page=50&where=Karachi&content-type=application/json`;
    const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    const results = data?.results || [];
    if (!results.length) { logger.warn('adzuna: 0 jobs'); return []; }
    return results
      .map((j) => normalizeJob({
        externalId: j.id,
        title: j.title,
        company: j.company?.display_name,
        description: j.description,
        rawLocation: j.location?.display_name,
        employmentType: j.contract_time || j.contract_type || null,
        salaryMin: Number.isFinite(j.salary_min) ? Math.round(j.salary_min) : null,
        salaryMax: Number.isFinite(j.salary_max) ? Math.round(j.salary_max) : null,
        salaryCurrency: 'PKR', // Adzuna PK quotes local currency
        skills: j.category?.label ? [j.category.label] : [],
        applyUrl: j.redirect_url,
        postedAt: j.created,
      }, 'adzuna', 'karachi'))
      .filter(Boolean);
  } catch (err) { logger.error(`adzuna: ${err.message}`); return []; }
}

// ---------------- Karachi scraper sources (disabled) ----------------
//
// Pakistan job boards (Rozee, Mustakbil, JobLo) have no stable free API. Per spec:
// check each source's ToS + robots.txt, prefer an official feed over scraping,
// keep request rates low (LOCAL_FETCH_DELAY_MS), and SKIP any source whose terms
// restrict automated access. Until a source is verified, it stays `enabled: false`
// and contributes nothing — the sequential+delay plumbing is ready for when one is
// cleared: add its listUrl + a parse(cheerio$) that returns raw jobs.
const KARACHI_SOURCES = [
  // Example shape (disabled — enable only after ToS/robots verified):
  // { platform: 'mustakbil', enabled: false, listUrl: 'https://...', parse: ($) => [...] },
];

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
  // API-backed sources run in parallel (remote boards + Adzuna Karachi).
  const apiFetchers = [fetchRemotive, fetchArbeitnow, fetchHimalayas, fetchAdzunaKarachi];
  const settled = await Promise.allSettled(apiFetchers.map((fn) => fn()));
  const fromApis = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // Scraper sources (currently none enabled) run sequentially with a polite delay.
  const fromScrapers = await fetchKarachiSources();
  const jobs = [...fromApis, ...fromScrapers];

  const sourceBreakdown = {};
  for (const j of jobs) sourceBreakdown[j.platform] = (sourceBreakdown[j.platform] || 0) + 1;

  return { jobs, sourceBreakdown };
}

module.exports = { fetchAllJobs, normalizeJob };

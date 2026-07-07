// services/cityNormalizer.js — normalizeCity() + classifyLocationType().
// Pure functions, no I/O. Logic pinned by backend/CLAUDE.md.

// Karachi aliases (lowercased). Raw strings run through normalizeCity() first.
const KARACHI = new Set(['karachi', 'khi', 'karachi', 'karāchi', 'karāchi']);

// Strip parentheticals, everything after a comma, and punctuation; then trim.
function normalizeCity(raw) {
  if (!raw) return null;
  const city = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/,.*$/, '')
    .replace(/[^\w\s]/g, '')
    .trim();
  if (!city) return null;
  return KARACHI.has(city) ? 'karachi' : city;
}

const REMOTE = ['remote', 'wfh', 'work from home', 'fully remote', 'work remotely', 'distributed'];
const HYBRID = ['hybrid', 'partial remote', 'partially remote', 'flexible work'];
const KHI_PLT = ['rozee', 'mustakbil', 'joblo'];

// Every job is classified once at fetch time. Remote/Hybrid keywords win first;
// otherwise a Karachi platform implies Onsite; default is Remote.
function classifyLocationType(title, desc, platform) {
  const t = `${title || ''} ${desc || ''}`.toLowerCase();
  if (REMOTE.some((k) => t.includes(k))) return 'Remote';
  if (HYBRID.some((k) => t.includes(k))) return 'Hybrid';
  if (KHI_PLT.includes(platform)) return 'Onsite';
  return 'Remote';
}

module.exports = { normalizeCity, classifyLocationType };

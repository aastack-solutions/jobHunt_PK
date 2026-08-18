// Shared "ghosted" detection — used by both routes/applications.js (per-row flag)
// and routes/dashboard.js (aggregate count). Kept in one place so the two never
// drift out of sync with each other. Computed fresh on every read, never stored.
const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['offer', 'rejected', 'withdrawn']);

// 14 days of silence right after applying, or 10 days of silence after the last
// stage progressed — common job-tracker convention (see docs/apply-bot research).
const GHOSTED_NO_RESPONSE_DAYS = 14;
const GHOSTED_STALLED_DAYS = 10;

function isGhosted(application, now = Date.now()) {
  if (TERMINAL_STATUSES.has(application.status)) return false;
  const daysSinceUpdate = (now - new Date(application.updatedAt).getTime()) / DAY_MS;
  const threshold = application.status === 'applied' ? GHOSTED_NO_RESPONSE_DAYS : GHOSTED_STALLED_DAYS;
  return daysSinceUpdate >= threshold;
}

module.exports = { isGhosted };

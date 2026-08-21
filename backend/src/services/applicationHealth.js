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

  // Found 2026-08-21 (code review): this used to measure staleness from
  // `updatedAt` for BOTH cases, but Prisma's `@updatedAt` is auto-managed and
  // always reflects "now" at the moment of the last write — it ignores any
  // explicitly-passed value, including on create(). Confirmed directly against
  // the real database: creating an application with `appliedAt` set 15 days in
  // the past still stores `updatedAt` as the actual current timestamp (the
  // insert time), not 15 days ago. That directly contradicted this feature's
  // own TEST_PLAN.md item ("an application with status: 'applied' and appliedAt
  // 15 days in the past returns isGhosted: true") — the old code always
  // returned false for a fresh row regardless of how old `appliedAt` was, since
  // daysSinceUpdate was always ~0 right after creation.
  //
  // Fixed: for a still-'applied' row (no response yet), "days of silence"
  // genuinely means days since the application was SENT — appliedAt, not
  // updatedAt. For a row that has progressed past 'applied' at least once,
  // updatedAt is the right clock: it reflects the last real state the tracker
  // observed. (Known, accepted limitation, not fixed here: editing `notes`
  // alone via PATCH /api/applications/:id also bumps updatedAt via the same
  // auto-managed field, which would reset a stalled-stage application's
  // ghosted clock even though nothing about the actual application progressed
  // — there's no separate "last real stage change" column to distinguish the
  // two without a schema change, which is out of scope for this fix.)
  if (application.status === 'applied') {
    const daysSinceApplied = (now - new Date(application.appliedAt).getTime()) / DAY_MS;
    return daysSinceApplied >= GHOSTED_NO_RESPONSE_DAYS;
  }
  const daysSinceUpdate = (now - new Date(application.updatedAt).getTime()) / DAY_MS;
  return daysSinceUpdate >= GHOSTED_STALLED_DAYS;
}

module.exports = { isGhosted };

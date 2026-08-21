// F13 — applicationHealth.js's isGhosted() (TEST_PLAN.md F13, items 4 and 5).
// Added 2026-08-21 (code review): this file had zero test coverage before,
// which is how a real bug survived — isGhosted() measured "days of silence"
// from `updatedAt` for a still-'applied' row, but Prisma's `@updatedAt` is
// auto-managed and always reflects the actual write time, ignoring any
// explicitly-passed value, even on create(). Confirmed directly against the
// real database before fixing: an application created with `appliedAt` set 15
// days in the past still got `updatedAt` stamped as the current insert time —
// so isGhosted() always returned false for a freshly-created row no matter how
// stale `appliedAt` was, directly contradicting this feature's own definition.
// See MEMORY.md's 2026-08-21 F1 entry for the full writeup, including the
// live-DB reproduction.
//
// isGhosted() is a pure function — it never touches the database itself, only
// reads plain fields off whatever object it's handed. So these tests use plain
// objects, not real Prisma rows: faster, and no DATABASE_URL dependency for a
// function that doesn't have one. (The Prisma `@updatedAt`-ignores-explicit-
// values behavior that caused the original bug is Prisma's own well-documented
// behavior, not something worth re-proving here on every run — it was already
// confirmed once, live, while diagnosing the bug.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isGhosted } = require('../src/services/applicationHealth');

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

function app(overrides) {
  return {
    status: 'applied',
    appliedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test('a still-applied row 15 days old is ghosted, based on appliedAt', () => {
  // updatedAt deliberately left at "now" here, matching what Prisma actually
  // does on create() regardless of appliedAt — this is the exact scenario that
  // was silently broken before the fix.
  assert.equal(isGhosted(app({ appliedAt: daysAgo(15) })), true);
});

test('a still-applied row from yesterday is not ghosted', () => {
  assert.equal(isGhosted(app({ appliedAt: daysAgo(1) })), false);
});

test('a still-applied row exactly at the 14-day threshold is ghosted (inclusive)', () => {
  assert.equal(isGhosted(app({ appliedAt: daysAgo(14) })), true);
});

test('offer/rejected/withdrawn are never ghosted, however old appliedAt or updatedAt is', () => {
  for (const status of ['offer', 'rejected', 'withdrawn']) {
    assert.equal(
      isGhosted(app({ status, appliedAt: daysAgo(60), updatedAt: daysAgo(60) })),
      false,
      `${status} must never be ghosted regardless of age`
    );
  }
});

test('a non-applied, non-terminal row (e.g. interview) uses updatedAt with the 10-day threshold', () => {
  // appliedAt is old in both cases (the application itself is weeks old) — what
  // matters for a row that HAS progressed at least once is how long it's been
  // since the last real change, which is what updatedAt reflects.
  const staleInterview = app({ status: 'interview', appliedAt: daysAgo(20), updatedAt: daysAgo(11) });
  assert.equal(isGhosted(staleInterview), true, '11 days since the last stage change must be ghosted');

  const freshInterview = app({ status: 'interview', appliedAt: daysAgo(20), updatedAt: daysAgo(2) });
  assert.equal(isGhosted(freshInterview), false, '2 days since the last stage change must not be ghosted yet');
});

test('a non-applied, non-terminal row exactly at the 10-day threshold is ghosted (inclusive)', () => {
  assert.equal(isGhosted(app({ status: 'technical', appliedAt: daysAgo(20), updatedAt: daysAgo(10) })), true);
});

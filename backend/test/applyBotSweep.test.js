// F10 — applyBotSweep.js's staleness thresholds. Uses the real Prisma client
// directly (no HTTP server needed, unlike applyTaskCallback.test.js) — just a live
// database to write/read fixture rows against.
//
// SKIPPED: requires a live Postgres database, which wasn't available in the
// session that scaffolded this file. Un-skip once one exists locally
// (see HOW_TO_RUN.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/db');
const { sweepStaleApplyTasks, RUNNING_STALE_MS } = require('../jobs/applyBotSweep');

test('a task running since RUNNING_STALE_MS + 1 gets swept to unknown_outcome',
  { skip: 'requires a live database' },
  async () => {
    // TODO: create a real User + ApplyTask fixture row with
    // status: 'running', startedAt: new Date(Date.now() - RUNNING_STALE_MS - 60000),
    // call sweepStaleApplyTasks(), then re-fetch the row and assert:
    //   - status === 'unknown_outcome' (NOT 'failed' — see the file's own comment
    //     on why: the outcome is genuinely ambiguous, might have already submitted)
    //   - failureReason mentions the process likely crashed
    assert.ok(prisma && RUNNING_STALE_MS, 'placeholder — see TODO above');
  }
);

test('a task running for less than the threshold is left untouched',
  { skip: 'requires a live database' },
  async () => {
    // TODO: create a fixture row with startedAt just a few seconds ago, run the
    // sweep, confirm the row's status is still 'running' — the sweep must not be
    // trigger-happy on tasks that are genuinely still in progress.
    assert.ok(sweepStaleApplyTasks, 'placeholder — see TODO above');
  }
);

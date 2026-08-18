// F10 — integration test for internal.js's callback idempotency guard
// (TERMINAL_STATUSES) — the test that would have caught the exact bug
// backendApi.js's retry wrapper could otherwise have reintroduced (a duplicate
// 'submitted' callback creating a second Application row). See
// docs/apply-bot/TECHNICAL_PLAN.md's "Security Findings & Fixes" #6.
//
// SKIPPED: this is a true integration test — it needs a live Postgres database
// AND a running backend instance (`npm run dev`, per HOW_TO_RUN.md) to hit real
// HTTP endpoints against. Neither was available in the session that scaffolded
// this file. Un-skip once both exist locally.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const APPLY_BOT_SECRET = process.env.APPLY_BOT_SECRET;

async function callback(taskId, body) {
  return fetch(`${BASE_URL}/api/internal/apply-bot/tasks/${taskId}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Apply-Bot-Secret': APPLY_BOT_SECRET },
    body: JSON.stringify(body),
  });
}

test('a duplicate submitted callback for an already-terminal task does not create a second Application',
  { skip: 'requires a live database and a running backend instance' },
  async () => {
    // TODO: seed a real ApplyTask row (via prisma or a helper), call callback()
    // with status: 'submitted' once, confirm an Application was created, then call
    // callback() again with the SAME payload and confirm:
    //   1. the response includes alreadyTerminal: true
    //   2. no second Application row exists for the same jobId/userId
    assert.ok(true, 'placeholder — see TODO above');
  }
);

test('a stale failed callback cannot downgrade an already-submitted task',
  { skip: 'requires a live database and a running backend instance' },
  async () => {
    // TODO: seed a real ApplyTask, mark it submitted via callback(), then send a
    // second callback with status: 'failed' for the same task id — confirm the
    // task's status in the database is STILL 'submitted', not overwritten.
    assert.ok(true, 'placeholder — see TODO above');
  }
);

// Security fix 2026-08-21 — GET /api/applications/export's CSV formula-
// injection guard. @json2csv/plainjs's default string formatter only quotes
// values; it never neutralizes a leading =, +, -, or @, which Excel/Sheets
// treat as the start of a formula and execute on open. jobTitle/company are
// attacker-influenceable (copied from Job rows sourced from ~13 external,
// only partially trusted fetch sources), and notes is fully user-controlled.
// See applications.js's csvSafeStringFormatter for the fix and MEMORY.md's
// 2026-08-21 entry for the full writeup.
//
// Mounts the real applications.js router on a throwaway server with a
// minimal fake session middleware, same pattern as applyTaskCallback.test.js
// in this directory. Requires DATABASE_URL (live database) — self-skips when
// absent, same convention as the other DB-dependent files here.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const hasDb = Boolean(process.env.DATABASE_URL);

let BASE_URL = null;
let ownServer = null;
let prisma = null;

async function ensureServer() {
  if (!hasDb) return false;
  if (BASE_URL) return true;

  prisma = require('../src/db');
  const testUser = await prisma.user.create({
    data: {
      email: `csv-export-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      fullName: 'CSV Export Test User',
    },
  });

  const express = require('express');
  const applicationsRoute = require('../src/routes/applications');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: testUser.id };
    next();
  });
  app.use('/api/applications', applicationsRoute);

  await new Promise((resolve) => {
    ownServer = app.listen(0, '127.0.0.1', resolve);
  });
  BASE_URL = `http://127.0.0.1:${ownServer.address().port}`;
  ensureServer.testUser = testUser;
  return true;
}

after(async () => {
  if (ownServer) await new Promise((resolve) => ownServer.close(resolve));
  if (!hasDb || !prisma) return;
  if (ensureServer.testUser) {
    await prisma.application.deleteMany({ where: { userId: ensureServer.testUser.id } });
    await prisma.user.delete({ where: { id: ensureServer.testUser.id } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

test('GET /api/applications/export defuses CSV formula injection in notes/company', async (t) => {
  if (!(await ensureServer())) {
    t.skip('requires DATABASE_URL (a live database) — not set');
    return;
  }

  const created = await fetch(`${BASE_URL}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobTitle: '=1+1',
      company: '+cmd|\' /C calc\'!A1',
      locationType: 'Remote',
      notes: '@SUM(1,1)',
    }),
  });
  assert.equal(created.status, 201);

  const exportRes = await fetch(`${BASE_URL}/api/applications/export`);
  assert.equal(exportRes.status, 200);
  const csv = await exportRes.text();

  // The raw CSV text must never contain a cell whose content starts with one
  // of the dangerous characters directly inside its quotes.
  assert.doesNotMatch(csv, /"=/, 'jobTitle cell must not start with ="');
  assert.doesNotMatch(csv, /"\+/, 'company cell must not start with "+');
  assert.doesNotMatch(csv, /"@/, 'notes cell must not start with "@');
  // The defused, prefixed value must still be present and recognizable.
  assert.match(csv, /'=1\+1/, 'defused jobTitle must still carry the original text');
  assert.match(csv, /'\+cmd/, 'defused company must still carry the original text');
  assert.match(csv, /'@SUM/, 'defused notes must still carry the original text');
});

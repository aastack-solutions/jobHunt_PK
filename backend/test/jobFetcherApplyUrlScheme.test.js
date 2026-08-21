// Security fix 2026-08-21 (code review) — normalizeJob() now rejects any
// applyUrl that isn't http(s). Job rows come from ~13 external, only partially
// trusted fetch sources; applyUrl is rendered as a clickable link in the
// frontend (JobCard.jsx) with no scheme check of its own. A `javascript:` URI
// is currently blocked in practice only by the app's CSP (script-src 'self')
// — real but incidental defense-in-depth, not something the data layer should
// rely on. See MEMORY.md's 2026-08-21 entry for the full writeup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJob } = require('../src/services/jobFetcher');

const BASE = { title: 'Software Engineer', company: 'Acme Co' };

test('normalizeJob: accepts a normal http(s) applyUrl', () => {
  const result = normalizeJob({ ...BASE, applyUrl: 'https://boards.greenhouse.io/acme/jobs/1' }, 'greenhouse');
  assert.ok(result, 'a valid https applyUrl must be accepted');
  assert.equal(result.applyUrl, 'https://boards.greenhouse.io/acme/jobs/1');

  const httpResult = normalizeJob({ ...BASE, applyUrl: 'http://example.com/apply' }, 'generic');
  assert.ok(httpResult, 'plain http (not just https) must still be accepted');
});

test('normalizeJob: rejects a javascript: applyUrl rather than storing it', () => {
  const result = normalizeJob({ ...BASE, applyUrl: 'javascript:alert(document.cookie)' }, 'generic');
  assert.equal(result, null, 'a javascript: URI must be treated the same as a missing applyUrl');
});

test('normalizeJob: rejects other non-http(s) schemes', () => {
  assert.equal(normalizeJob({ ...BASE, applyUrl: 'data:text/html,<script>1</script>' }, 'generic'), null);
  assert.equal(normalizeJob({ ...BASE, applyUrl: 'file:///etc/passwd' }, 'generic'), null);
  assert.equal(normalizeJob({ ...BASE, applyUrl: 'ftp://example.com/apply' }, 'generic'), null);
});

test('normalizeJob: rejects a malformed applyUrl rather than throwing', () => {
  assert.equal(normalizeJob({ ...BASE, applyUrl: 'not a url at all' }, 'generic'), null);
});

test('normalizeJob: still rejects a missing applyUrl (pre-existing behavior, unchanged)', () => {
  assert.equal(normalizeJob({ ...BASE, applyUrl: '' }, 'generic'), null);
  assert.equal(normalizeJob({ ...BASE }, 'generic'), null);
});

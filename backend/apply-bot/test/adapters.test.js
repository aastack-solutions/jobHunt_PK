// F10 — permanent regression test for adapters/index.js's resolveAdapter() and each
// adapter's matches(). Pure URL-matching logic — no browser/Playwright needed, so
// this runs even though the browser-dependent parts of these adapters can't be
// tested in this environment (see the leverAdapter.js file comment on the 403s hit
// trying to fetch real Lever postings directly).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAdapter } = require('../src/adapters');

test('resolveAdapter: routes real Greenhouse/Lever/Ashby URLs to the right adapter', () => {
  assert.equal(resolveAdapter('https://job-boards.greenhouse.io/thehonestcompanysandbox/jobs/140167').platform, 'greenhouse');
  assert.equal(resolveAdapter('https://jobs.lever.co/voltus/f13d367c-97c1-4af3-8e8b-06827017fee2').platform, 'lever');
  assert.equal(resolveAdapter('https://jobs.ashbyhq.com/some-company/some-posting-id').platform, 'ashby');
});

test('resolveAdapter: a non-ATS URL falls through to genericAdapter (F8, scaffolded — not gone, but never actually used until applyBotSelect.js\'s APPLY_BOT_GENERIC_ENABLED gate is on)', () => {
  assert.equal(resolveAdapter('https://remotive.com/remote-jobs/some-job').platform, 'generic');
});

test('resolveAdapter: returns null for a malformed URL rather than throwing', () => {
  assert.equal(resolveAdapter('not-a-url'), null);
});

test('resolveAdapter: hostname-suffix spoofing falls through to generic, not the real adapter (security fix 2026-08-21)', () => {
  // "boards.greenhouse.io.attacker.com" CONTAINS "greenhouse.io" as a substring
  // but is not that domain or a subdomain of it. Each adapter's matches() used
  // to be a naive .includes() check, so a URL like this would wrongly route to
  // the real greenhouseAdapter — which, for a platform with login() enabled,
  // decrypts and types the user's real stored credential into whatever page is
  // actually at this attacker-controlled host.
  assert.equal(resolveAdapter('https://boards.greenhouse.io.attacker.com/apply').platform, 'generic');
  assert.equal(resolveAdapter('https://jobs.lever.co.attacker.com/apply').platform, 'generic');
  assert.equal(resolveAdapter('https://jobs.ashbyhq.com.attacker.com/apply').platform, 'generic');
  // A real subdomain of the real domain must still resolve to the real adapter.
  assert.equal(resolveAdapter('https://job-boards.greenhouse.io/realcompany/jobs/1').platform, 'greenhouse');
});

test('every registered adapter is usesBrowser (Contract A correction, 2026-08-17): none are API-based', () => {
  const { ADAPTERS } = require('../src/adapters');
  for (const adapter of ADAPTERS) {
    assert.ok(typeof adapter.matches === 'function', `${adapter.platform} must export matches()`);
    assert.ok(typeof adapter.login === 'function', `${adapter.platform} must export login() — all current adapters are browser-based`);
    assert.ok(typeof adapter.fillApplication === 'function', `${adapter.platform} must export fillApplication()`);
  }
});

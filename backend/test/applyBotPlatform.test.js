// F10 — permanent regression tests for applyBotPlatform.js, using real URLs found
// during this session's research (not made-up examples).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlatform, requiresCredential } = require('../src/services/applyBotPlatform');

test('resolvePlatform: real Greenhouse posting URL', () => {
  assert.equal(resolvePlatform('https://job-boards.greenhouse.io/thehonestcompanysandbox/jobs/140167'), 'greenhouse');
});

test('resolvePlatform: real Lever posting URLs', () => {
  assert.equal(resolvePlatform('https://jobs.lever.co/voltus/f13d367c-97c1-4af3-8e8b-06827017fee2'), 'lever');
  assert.equal(resolvePlatform('https://jobs.lever.co/palantir/b5ad6660-8145-4be5-97e2-3799f2912f5b'), 'lever');
});

test('resolvePlatform: Ashby embed example URL', () => {
  assert.equal(resolvePlatform('https://jobs.ashbyhq.com/some-company/some-posting-id'), 'ashby');
});

test('resolvePlatform: aggregator/non-ATS sources fall back to generic', () => {
  assert.equal(resolvePlatform('https://remotive.com/remote-jobs/some-job'), 'generic');
  assert.equal(resolvePlatform('https://www.adzuna.com/details/12345'), 'generic');
});

test('resolvePlatform: malformed URL falls back to generic rather than throwing', () => {
  assert.equal(resolvePlatform('not-a-url'), 'generic');
  assert.equal(resolvePlatform(''), 'generic');
});

test('resolvePlatform: hostname-suffix spoofing is rejected, not misclassified (security fix 2026-08-21)', () => {
  // "boards.greenhouse.io.attacker.com" CONTAINS "greenhouse.io" as a substring
  // but is not that domain or a subdomain of it — a naive .includes() check
  // (the original bug) would wrongly classify this as the real platform,
  // triggering the real adapter to decrypt and type the user's stored
  // Greenhouse/Lever/Ashby credential into an attacker-controlled page.
  assert.equal(resolvePlatform('https://boards.greenhouse.io.attacker.com/apply'), 'generic');
  assert.equal(resolvePlatform('https://jobs.lever.co.attacker.com/apply'), 'generic');
  assert.equal(resolvePlatform('https://jobs.ashbyhq.com.attacker.com/apply'), 'generic');
  // A real subdomain of the real domain must still resolve correctly.
  assert.equal(resolvePlatform('https://job-boards.greenhouse.io/realcompany/jobs/1'), 'greenhouse');
});

test('requiresCredential: Greenhouse/Lever/Ashby need a stored credential, generic does not', () => {
  assert.equal(requiresCredential('greenhouse'), true);
  assert.equal(requiresCredential('lever'), true);
  assert.equal(requiresCredential('ashby'), true);
  assert.equal(requiresCredential('generic'), false);
});

// F10 — permanent regression tests for applyBotPlatform.js, using real URLs found
// during this session's research (not made-up examples).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlatform, requiresCredential, resolveNavigationUrl, greenhouseJobId } = require('../src/services/applyBotPlatform');

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

// ---------------------------------------------------------------------------
// F8a regression suite - employer-hosted Greenhouse boards.
// Every URL below is REAL, taken from this project's own job table during the
// section E corpus research (docs/apply-bot/01-research-plan.md). They are the
// exact shape that made 611 of 1088 "generic" URLs a misclassification.
// ---------------------------------------------------------------------------

const EMPLOYER_HOSTED_GREENHOUSE = [
  'https://www.samsara.com/company/careers/roles/8024328?gh_jid=8024328',
  'https://www.coinbase.com/careers/positions/8054862?gh_jid=8054862',
  'https://stripe.com/jobs/search?gh_jid=7993151',
  'https://instacart.careers/job/?gh_jid=7144697',
  'https://databricks.com/company/careers/open-positions/job?gh_jid=8593713002',
  'https://careers.airbnb.com/positions/8031901?gh_jid=8031901',
  'https://jobs.dropbox.com/listing/8107794?gh_jid=8107794',
  'https://www.asana.com/jobs/apply/7392983?gh_jid=7392983',
];

test('resolvePlatform: a gh_jid parameter means Greenhouse even on the employer own domain', () => {
  for (const url of EMPLOYER_HOSTED_GREENHOUSE) {
    assert.equal(resolvePlatform(url), 'greenhouse', url);
  }
});

test('resolvePlatform: the behaviour change this causes is that these now require a credential', () => {
  // Recorded as a test rather than a comment because it is the user-visible half of
  // F8a: without a stored Greenhouse credential these jobs go from "attempted as
  // generic" to "skipped at selection". Signed off before shipping.
  assert.equal(requiresCredential(resolvePlatform(EMPLOYER_HOSTED_GREENHOUSE[0])), true);
});

test('resolvePlatform: a non-numeric gh_jid is NOT trusted', () => {
  // gh_jid arrives from third-party job feeds and ends up interpolated into a URL
  // the bot navigates to, so anything that is not plainly a job id must not match.
  assert.equal(resolvePlatform('https://evil.test/x?gh_jid=../../etc/passwd'), 'generic');
  assert.equal(resolvePlatform('https://evil.test/x?gh_jid='), 'generic');
  assert.equal(resolvePlatform('https://evil.test/x?gh_jid=123abc'), 'generic');
  assert.equal(greenhouseJobId('https://evil.test/x?gh_jid=99'), '99');
});

test('resolveNavigationUrl: rewrites an employer-hosted board to the slug-free embed form', () => {
  assert.equal(
    resolveNavigationUrl('https://www.coinbase.com/careers/positions/8054862?gh_jid=8054862'),
    'https://boards.greenhouse.io/embed/job_app?token=8054862'
  );
  // Legacy host on purpose: it accepts token alone and lets Greenhouse fill in the
  // employer slug itself. Verified on 7 real postings - see the source comment.
  for (const url of EMPLOYER_HOSTED_GREENHOUSE) {
    const nav = resolveNavigationUrl(url);
    assert.match(nav, /^https:\/\/boards\.greenhouse\.io\/embed\/job_app\?token=\d+$/, url);
    // The rewritten URL must land on a host greenhouseAdapter.matches() accepts
    // — exact-match "greenhouse.io" or a genuine subdomain of it, since the
    // 2026-08-21 security fix (see PLATFORM_HOSTS's own comment) — this is the
    // cross-service contract that makes the whole rewrite worth doing.
    const navHostname = new URL(nav).hostname.toLowerCase();
    assert.ok(navHostname === 'greenhouse.io' || navHostname.endsWith('.greenhouse.io'));
  }
});

test('resolveNavigationUrl: leaves URLs that already work exactly as they are', () => {
  // F5 verified these directly; rewriting them would be a regression.
  const untouched = [
    'https://job-boards.greenhouse.io/samsara/jobs/8024328',
    'https://boards.greenhouse.io/acme/jobs/12345',
    'https://jobs.lever.co/acme/abc-123',
    'https://jobs.ashbyhq.com/acme/abc-123',
    'https://remoteok.com/remote-jobs/some-job-1136666',
    'https://weworkremotely.com/remote-jobs/some-job',
    'not a url at all',
  ];
  for (const url of untouched) assert.equal(resolveNavigationUrl(url), url, url);
});

test('resolveNavigationUrl: a greenhouse.io URL that also carries gh_jid is still left alone', () => {
  // Guards the ordering inside resolveNavigationUrl: the host check must win, or a
  // working canonical URL would be rewritten into an embed for no reason.
  const url = 'https://job-boards.greenhouse.io/samsara/jobs/8024328?gh_jid=8024328';
  assert.equal(resolveNavigationUrl(url), url);
});

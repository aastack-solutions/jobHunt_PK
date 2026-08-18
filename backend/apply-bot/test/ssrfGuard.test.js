// F10 — permanent regression test for ssrfGuard.js's isBlockedIp(), formalizing the
// 18-case suite that was manually run once during the 2026-08-17 security pass (see
// docs/apply-bot/TECHNICAL_PLAN.md's "Security Findings & Fixes"). Without this as a
// permanent test, a future edit could silently reintroduce the exact bypass classes
// this was built to catch (RFC1918 boundary errors, the IPv4-mapped-IPv6 bypass).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedIp } = require('../src/engine/ssrfGuard');

const CASES = [
  ['169.254.169.254', true, 'AWS/GCP/cloud metadata endpoint'],
  ['127.0.0.1', true, 'loopback'],
  ['10.0.0.5', true, 'RFC1918 10/8'],
  ['172.16.5.5', true, 'RFC1918 172.16/12 — lower boundary'],
  ['172.31.255.255', true, 'RFC1918 172.16/12 — upper boundary'],
  ['172.32.5.5', false, 'just outside 172.16/12 — must NOT be blocked'],
  ['172.15.255.255', false, 'just below 172.16/12 — must NOT be blocked'],
  ['192.168.1.1', true, 'RFC1918 192.168/16'],
  ['100.64.0.1', true, 'CGNAT'],
  ['8.8.8.8', false, 'public DNS (Google)'],
  ['1.1.1.1', false, 'public DNS (Cloudflare)'],
  ['0.0.0.0', true, '"this network"'],
  ['::1', true, 'IPv6 loopback'],
  ['fe80::1', true, 'IPv6 link-local'],
  ['fc00::1', true, 'IPv6 unique-local'],
  ['::ffff:169.254.169.254', true, 'IPv4-mapped IPv6 metadata bypass attempt'],
  ['::ffff:8.8.8.8', false, 'IPv4-mapped IPv6, public address'],
  ['2001:4860:4860::8888', false, 'public IPv6 (Google DNS)'],
];

for (const [ip, expected, label] of CASES) {
  test(`isBlockedIp(${ip}) === ${expected} — ${label}`, () => {
    assert.equal(isBlockedIp(ip), expected);
  });
}

// Security fix 2026-08-21: greenhouseAdapter.login() now re-verifies page.url()'s
// hostname immediately before typing a credential, as defense-in-depth alongside
// the matches() hostname fix (see that function's own comment for the full
// exploit chain this closes). This tests that check in isolation with a minimal
// fake `page` — login() must bail out before touching any other page method once
// the hostname check fails, so a fake exposing only `.url()` is enough to prove
// the guard fires first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { login } = require('../src/adapters/greenhouseAdapter');

function fakePageAt(url) {
  return {
    url: () => url,
    // Any other method being called would throw — proves login() returns
    // before reaching the credential-typing steps below the hostname check.
    getByRole: () => { throw new Error('should not be called — hostname check must short-circuit first'); },
    getByLabel: () => { throw new Error('should not be called — hostname check must short-circuit first'); },
  };
}

const credential = { username: 'user@example.com', password: 'hunter2' };

test('login() refuses to run on a spoofed host even if matches() were somehow bypassed', async () => {
  const page = fakePageAt('https://boards.greenhouse.io.attacker.com/apply');
  const result = await login(page, credential);
  assert.deepEqual(result, { attempted: false });
});

test('login() refuses to run on an unrelated host', async () => {
  const page = fakePageAt('https://example.com/apply');
  const result = await login(page, credential);
  assert.deepEqual(result, { attempted: false });
});

test('login() is a no-op (not a refusal) when no credential is provided, regardless of host', async () => {
  const page = fakePageAt('https://boards.greenhouse.io.attacker.com/apply');
  const result = await login(page, null);
  assert.deepEqual(result, { attempted: false });
});

test('login() still proceeds normally on the real greenhouse.io host (the hostname re-check must not break the legitimate case)', async () => {
  const calls = [];
  const chainable = (label) => ({
    first: () => chainable(label),
    count: async () => 1,
    click: async () => { calls.push(`click:${label}`); },
    fill: async (v) => { calls.push(`fill:${label}:${v}`); },
  });
  const page = {
    url: () => 'https://boards.greenhouse.io/somecompany/jobs/1',
    getByRole: (_role, opts) => chainable(`role:${opts.name}`),
    getByLabel: (label) => chainable(`label:${label}`),
  };
  const result = await login(page, credential);
  assert.deepEqual(result, { attempted: true });
  assert.ok(calls.some((c) => c.includes(credential.username)), 'username was typed');
  assert.ok(calls.some((c) => c.includes(credential.password)), 'password was typed');
});

test('login() still proceeds normally on a genuine subdomain of greenhouse.io', async () => {
  const chainable = () => ({
    first: () => chainable(),
    count: async () => 1,
    click: async () => {},
    fill: async () => {},
  });
  const page = {
    url: () => 'https://job-boards.greenhouse.io/somecompany/jobs/1',
    getByRole: () => chainable(),
    getByLabel: () => chainable(),
  };
  const result = await login(page, credential);
  assert.deepEqual(result, { attempted: true });
});

// Regression test for worker.js's TASK_DEADLINE_MS race (raceWithDeadline/
// processTask). The F3 code review flagged the only prior verification of this
// mechanism (docs/apply-bot/TEST_PLAN.md) as a manual test against a nip.io
// hostname resolving to 203.0.113.1 — a TEST-NET address that is ALSO in
// ssrfGuard.js's own IPV4_BLOCKED_RANGES blocklist. That means the observed
// "force-failed at the deadline" behavior could just as easily have been the SSRF
// guard's own fast abort (page.goto() rejecting almost immediately) racing a
// short TASK_DEADLINE_MS_OVERRIDE, not a genuine indefinite hang — the test never
// actually proved the deadline mechanism works for a real hang. This file tests
// the race directly: a workFn that simply never resolves, no network, no browser,
// no SSRF guard involved, so there's no ambiguity about what's being exercised.
//
// worker.js transitively requires 'playwright' (via engine/browserSession.js) at
// module scope, so — same pattern as captchaDetector.test.js/fieldTaxonomy.test.js
// in this same directory — the require is done lazily INSIDE each test body, not
// at the top of this file. Requiring it unconditionally at the top would make
// every test below fail to even load in an environment without Playwright
// installed, instead of skipping cleanly (this exact class of bug — skip guards
// that only skip the test body, not a top-level require — has been hit and fixed
// twice before elsewhere in this repo; see MEMORY.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');

function playwrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}
const skipReason = playwrightAvailable()
  ? false
  : 'requires Playwright to be installed — worker.js transitively requires it via browserSession.js';

test('raceWithDeadline fires the deadline callback when the work never resolves', { skip: skipReason }, async () => {
  const { raceWithDeadline } = require('../src/worker');
  let deadlineFired = false;
  const neverResolves = () => new Promise(() => {});

  const fired = await raceWithDeadline(neverResolves, 50, async () => {
    deadlineFired = true;
  });

  assert.equal(fired, true);
  assert.equal(deadlineFired, true);
});

test('raceWithDeadline does NOT fire the deadline callback when the work finishes first', { skip: skipReason }, async () => {
  const { raceWithDeadline } = require('../src/worker');
  let deadlineFired = false;
  const fastWork = () => new Promise((resolve) => setTimeout(resolve, 10));

  const fired = await raceWithDeadline(fastWork, 500, async () => {
    deadlineFired = true;
  });

  assert.equal(fired, false);
  assert.equal(deadlineFired, false);
});

test('raceWithDeadline still resolves cleanly even if the onDeadline callback itself throws', { skip: skipReason }, async () => {
  const { raceWithDeadline } = require('../src/worker');
  const neverResolves = () => new Promise(() => {});

  await assert.doesNotReject(
    raceWithDeadline(neverResolves, 20, async () => {
      throw new Error('boom — e.g. closeSession() or reportResult() itself failing');
    })
  );
});

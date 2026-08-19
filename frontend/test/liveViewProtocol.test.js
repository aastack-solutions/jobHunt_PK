// F11 / F10 — Contract B conformance for the live-view protocol.
//
// Runs on Node's built-in test runner (`npm test` in frontend/), zero new
// dependencies — the same approach the backend uses. That is possible only because
// the protocol logic lives in a pure module: the component around it needs a
// browser, this does not.
//
// What these guard is the half of the contract that silently misbehaves rather than
// crashing. A coordinate sent outside 0..1 does not throw anywhere — the apply-bot
// side just denormalizes it and clicks somewhere that is not on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAUSE_REASONS,
  PAUSE_INSTRUCTIONS,
  normalizePoint,
  buildMouseMessage,
  buildKeyboardMessage,
  buildMarkResolvedMessage,
  parseServerMessage,
} from '../src/lib/liveViewProtocol.js';

// Shape of what getBoundingClientRect() returns for a canvas offset on the page.
const RECT = { left: 100, top: 50, width: 800, height: 400 };

test('normalizePoint maps a canvas-relative pointer into the 0..1 space', () => {
  assert.deepEqual(normalizePoint(RECT, 100, 50), { x: 0, y: 0 }, 'top-left corner');
  assert.deepEqual(normalizePoint(RECT, 900, 450), { x: 1, y: 1 }, 'bottom-right corner');
  assert.deepEqual(normalizePoint(RECT, 500, 250), { x: 0.5, y: 0.5 }, 'centre');
});

test('normalizePoint clamps a pointer that left the canvas mid-drag', () => {
  // A drag that starts on the canvas keeps delivering events after the pointer
  // leaves it. Un-clamped this sends x/y outside the contract, and the far side
  // dutifully clicks off-page — a silent failure, not an error.
  assert.deepEqual(normalizePoint(RECT, 0, 0), { x: 0, y: 0 }, 'above and left of the canvas');
  assert.deepEqual(normalizePoint(RECT, 5000, 5000), { x: 1, y: 1 }, 'far below and right');
});

test('normalizePoint survives a zero-sized or missing rect', () => {
  // A canvas that has not laid out yet reports width 0 — dividing by it yields
  // Infinity/NaN, which would serialize into the message as null.
  assert.deepEqual(normalizePoint({ left: 0, top: 0, width: 0, height: 0 }, 10, 10), { x: 0, y: 0 });
  assert.deepEqual(normalizePoint(null, 10, 10), { x: 0, y: 0 });
});

test('buildMouseMessage produces exactly Contract B shape', () => {
  const msg = buildMouseMessage('task-1', 'click', { x: 0.25, y: 0.75 });
  assert.deepEqual(msg, { type: 'mouse', taskId: 'task-1', action: 'click', x: 0.25, y: 0.75 });
});

test('buildMouseMessage rejects an action the contract does not define', () => {
  assert.equal(buildMouseMessage('task-1', 'rightclick', { x: 0.5, y: 0.5 }), null);
  for (const action of ['move', 'down', 'up', 'click', 'dblclick', 'wheel']) {
    assert.ok(buildMouseMessage('task-1', action, { x: 0, y: 0 }), `${action} is in the contract`);
  }
});

test('buildMouseMessage clamps even if handed an out-of-range point directly', () => {
  // Belt and braces: normalizePoint already clamps, but nothing stops a future
  // caller passing raw numbers, and the contract is what matters here.
  assert.deepEqual(buildMouseMessage('t', 'click', { x: -3, y: 42 }), { type: 'mouse', taskId: 't', action: 'click', x: 0, y: 1 });
  assert.deepEqual(buildMouseMessage('t', 'click', { x: NaN, y: undefined }), { type: 'mouse', taskId: 't', action: 'click', x: 0, y: 0 });
});

test('buildKeyboardMessage distinguishes typing text from pressing a named key', () => {
  assert.deepEqual(buildKeyboardMessage('t', 'type', { text: '4A9X' }), { type: 'keyboard', taskId: 't', action: 'type', text: '4A9X' });
  assert.deepEqual(buildKeyboardMessage('t', 'down', { key: 'Enter' }), { type: 'keyboard', taskId: 't', action: 'down', key: 'Enter' });
});

test('buildKeyboardMessage refuses a message that would be a no-op on the far side', () => {
  assert.equal(buildKeyboardMessage('t', 'type', { text: '' }), null, 'empty text');
  assert.equal(buildKeyboardMessage('t', 'type', {}), null, 'type with no text');
  assert.equal(buildKeyboardMessage('t', 'down', {}), null, 'key press with no key');
  assert.equal(buildKeyboardMessage('t', 'press', { key: 'a' }), null, 'action not in the contract');
});

test('buildMarkResolvedMessage is the documented shape', () => {
  assert.deepEqual(buildMarkResolvedMessage('task-9'), { type: 'mark-resolved', taskId: 'task-9' });
});

test('parseServerMessage accepts a well-formed frame', () => {
  const frame = { type: 'frame', taskId: 't', image: 'data:image/jpeg;base64,AAAA', width: 1280, height: 800, timestamp: 123 };
  assert.deepEqual(parseServerMessage(JSON.stringify(frame)), frame);
});

test('parseServerMessage refuses a frame whose image is not a data: image URL', () => {
  // The frame goes straight into an <img> src, so this is the one spot where a
  // hostile or buggy server could otherwise put an arbitrary URL into the page.
  const bad = (image) => parseServerMessage({ type: 'frame', taskId: 't', image, width: 10, height: 10 });
  assert.equal(bad('https://evil.test/tracker.gif'), null, 'remote URL');
  assert.equal(bad('javascript:alert(1)'), null, 'javascript scheme');
  assert.equal(bad('data:text/html;base64,PHNjcmlwdD4='), null, 'data URL that is not an image');
  assert.equal(bad(''), null, 'empty');
});

test('parseServerMessage refuses a frame with nonsensical dimensions', () => {
  const dims = (width, height) => parseServerMessage({ type: 'frame', taskId: 't', image: 'data:image/png;base64,AAAA', width, height });
  assert.equal(dims(0, 800), null);
  assert.equal(dims(1280, -1), null);
  assert.equal(dims('1280', 800), null);
});

test('parseServerMessage returns null rather than throwing on junk', () => {
  // This runs inside socket.onmessage — one bad frame must not tear down a session
  // a human is in the middle of.
  assert.equal(parseServerMessage('not json at all'), null);
  assert.equal(parseServerMessage('null'), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'somethingElse' })), null);
  assert.equal(parseServerMessage(undefined), null);
});

test('parseServerMessage falls back to unknown_challenge for an unrecognised pause reason', () => {
  // Better than showing nothing: the human is looking at a stuck browser either way.
  const parsed = parseServerMessage({ type: 'pause', taskId: 't', pauseReason: 'something_new' });
  assert.equal(parsed.pauseReason, 'unknown_challenge');
  assert.equal(parsed.instructions, PAUSE_INSTRUCTIONS.unknown_challenge);
});

test('every documented pause reason has instructions, and no extras exist', () => {
  // The plan requires these three values to match ApplyTask.pauseReason exactly —
  // "neither side may become a superset of the other".
  assert.deepEqual(PAUSE_REASONS, ['captcha', 'email_verification', 'unknown_challenge']);
  assert.deepEqual(Object.keys(PAUSE_INSTRUCTIONS).sort(), [...PAUSE_REASONS].sort());
});

test('resumed and closed parse to their bare form', () => {
  assert.deepEqual(parseServerMessage({ type: 'resumed', taskId: 't' }), { type: 'resumed', taskId: 't' });
  assert.deepEqual(parseServerMessage({ type: 'closed', taskId: 't' }), { type: 'closed', taskId: 't' });
});

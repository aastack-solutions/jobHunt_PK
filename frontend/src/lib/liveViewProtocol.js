// Contract B (docs/apply-bot/TECHNICAL_PLAN.md, "Interface Contracts") — the
// live-view WebSocket protocol, as pure functions.
//
// Kept out of ApplyBotLiveView.jsx on purpose: the component needs a browser, a
// canvas and a socket, none of which a test can easily stand up, while the parts
// that are actually easy to get wrong — normalizing a pointer to the 0..1 space the
// apply-bot side denormalizes against, and refusing a malformed server frame — are
// plain data transforms. Those live here so they can be tested for real.
//
// The apply-bot side of this protocol is backend/apply-bot/src/liveView.js. Any
// change here needs the same change there; that is what makes it a contract.

// Must stay in sync with ApplyTask.pauseReason in prisma/schema.prisma — the plan
// calls this out explicitly: neither side may become a superset of the other.
export const PAUSE_REASONS = ['captcha', 'email_verification', 'unknown_challenge'];

export const PAUSE_INSTRUCTIONS = {
  captcha: 'Solve the CAPTCHA below, then choose "I solved it, continue".',
  email_verification:
    'Check the inbox this application used, find the verification code, type it into the form below, then choose "I solved it, continue".',
  unknown_challenge: 'Something on this page needs a human. Once you have dealt with it, choose "I solved it, continue".',
};

const MOUSE_ACTIONS = ['move', 'down', 'up', 'click', 'dblclick', 'wheel'];
const KEYBOARD_ACTIONS = ['type', 'down', 'up'];
const SERVER_MESSAGE_TYPES = ['frame', 'pause', 'resumed', 'closed'];

// A data: URL for a JPEG/PNG and nothing else. The frame is assigned straight to an
// <img> src, so this is the one place a hostile or buggy server could otherwise get
// an arbitrary URL (or a javascript: scheme) into the page.
const FRAME_IMAGE_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Canvas-relative pointer position as a 0..1 fraction of each axis. Clamped because
// a drag that starts on the canvas keeps delivering events after the pointer leaves
// it, which would otherwise send coordinates outside the contract's range and have
// the far side click somewhere that is not on the page at all.
export function normalizePoint(rect, clientX, clientY) {
  if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function buildMouseMessage(taskId, action, point) {
  if (!MOUSE_ACTIONS.includes(action)) return null;
  return { type: 'mouse', taskId, action, x: clamp01(point?.x), y: clamp01(point?.y) };
}

// `text` for a whole typed string, `key` for a single named key (Enter, Backspace).
// Sending neither would be a no-op on the far side, so it is rejected here instead.
export function buildKeyboardMessage(taskId, action, { text, key } = {}) {
  if (!KEYBOARD_ACTIONS.includes(action)) return null;
  if (action === 'type') {
    if (typeof text !== 'string' || text.length === 0) return null;
    return { type: 'keyboard', taskId, action, text };
  }
  if (typeof key !== 'string' || key.length === 0) return null;
  return { type: 'keyboard', taskId, action, key };
}

export function buildMarkResolvedMessage(taskId) {
  return { type: 'mark-resolved', taskId };
}

// Returns a validated message, or null for anything that does not conform. Null
// rather than a throw because this runs inside a socket's onmessage: one malformed
// frame should be dropped, not tear down a live session a human is in the middle of.
export function parseServerMessage(raw) {
  let msg;
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  if (!SERVER_MESSAGE_TYPES.includes(msg.type)) return null;

  if (msg.type === 'frame') {
    if (typeof msg.image !== 'string' || !FRAME_IMAGE_PATTERN.test(msg.image)) return null;
    if (!Number.isFinite(msg.width) || !Number.isFinite(msg.height)) return null;
    if (msg.width <= 0 || msg.height <= 0) return null;
    return { type: 'frame', taskId: msg.taskId, image: msg.image, width: msg.width, height: msg.height, timestamp: msg.timestamp };
  }

  if (msg.type === 'pause') {
    // An unrecognised reason still pauses — falling back beats showing nothing,
    // since the human is looking at a stuck browser either way.
    const pauseReason = PAUSE_REASONS.includes(msg.pauseReason) ? msg.pauseReason : 'unknown_challenge';
    return { type: 'pause', taskId: msg.taskId, pauseReason, instructions: msg.instructions || PAUSE_INSTRUCTIONS[pauseReason] };
  }

  return { type: msg.type, taskId: msg.taskId };
}

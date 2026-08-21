// applyBotLive.js (F7) — authenticated WS proxy between the frontend and
// apply-bot's live-view WS server (liveView.js). apply-bot has no public
// networking (same rule as resume-parser) — this proxy is the ONLY path a
// browser can ever reach it through.
//
// Verified 2026-08-19 (F7) — see docs/apply-bot/TEST_PLAN.md F7 and MEMORY.md.
//
// The real complexity here, flagged explicitly rather than hand-waved: a raw
// WebSocket upgrade (`server.on('upgrade', ...)`) does NOT go through Express's
// normal middleware chain — `req.session` is not populated the way it is for a
// regular HTTP request. Authenticating this connection means manually parsing the
// session cookie from the upgrade request's headers and looking it up against the
// same Redis session store `express-session` uses (see app.js's `RedisStore`
// setup) — don't skip this and trust the client-supplied taskId alone.
const { WebSocketServer, WebSocket } = require('ws');
const cookie = require('cookie');
const cookieSignature = require('cookie-signature');
const prisma = require('../db');
const redisClient = require('../redis');
const logger = require('../logger');

const APPLY_BOT_INTERNAL_WS_URL = process.env.APPLY_BOT_INTERNAL_URL
  ? process.env.APPLY_BOT_INTERNAL_URL.replace(/^http/, 'ws') + '/live'
  : 'ws://localhost:8100/live';

const SESSION_COOKIE_NAME = 'connect.sid'; // express-session's default, matches app.js (no `name` override there)
const SESSION_REDIS_PREFIX = 'sess:'; // matches app.js's RedisStore({ prefix: 'sess:' })

// `cookie` and `cookie-signature` are transitive dependencies of express-session
// (already installed, not a new pinned dependency) — this is the same signing
// scheme express-session itself uses internally, reproduced here because a raw WS
// upgrade never runs through the `session` middleware that would normally do this.
async function getUserIdFromRequest(req) {
  const rawCookieHeader = req.headers.cookie;
  if (!rawCookieHeader) return null;

  const cookies = cookie.parse(rawCookieHeader);
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;

  // express-session signs cookies as "s:<sid>.<hmac>" (URL-decoded by cookie.parse
  // already) — strip the "s:" prefix before verifying the signature.
  if (!raw.startsWith('s:')) return null;
  const sid = cookieSignature.unsign(raw.slice(2), process.env.SESSION_SECRET);
  if (!sid) return null; // signature didn't verify — tampered or wrong secret

  const stored = await redisClient.get(`${SESSION_REDIS_PREFIX}${sid}`).catch(() => null);
  if (!stored) return null; // session expired or never existed

  try {
    return JSON.parse(stored).userId || null;
  } catch {
    return null;
  }
}

// Call this from app.js after `const server = app.listen(...)`, same "after
// listen, not at module scope" timing rule as the AI/scheduler workers.
function attachApplyBotLiveProxy(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    // Only intercept our own path — let any other upgrade request (there
    // shouldn't be one elsewhere in this app today, but be defensive) pass
    // through untouched rather than swallowing it.
    const url = new URL(req.url, 'http://internal');
    if (!url.pathname.startsWith('/api/apply-bot/live/')) return;

    const taskId = url.pathname.split('/').pop();
    const userId = await getUserIdFromRequest(req).catch(() => null);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const task = await prisma.applyTask.findUnique({ where: { id: taskId } }).catch(() => null);
    if (!task || task.userId !== userId || task.status !== 'paused_human') {
      // Same 401 for "doesn't exist," "not yours," and "not currently paused" —
      // no reason to tell an unauthenticated-for-this-task caller which one it is.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, req, taskId);
    });
  });

  wss.on('connection', (clientWs, req, taskId) => {
    const upstream = new WebSocket(`${APPLY_BOT_INTERNAL_WS_URL}?taskId=${taskId}`, {
      headers: { 'X-Apply-Bot-Secret': process.env.APPLY_BOT_SECRET },
    });

    // Straight bidirectional pipe — the actual protocol (Contract B's message
    // shapes) is interpreted by the frontend and by liveView.js, not here. This
    // proxy deliberately stays a dumb relay so the WS message contract has exactly
    // one place it's parsed on each end, not three.
    clientWs.on('message', (data) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });
    upstream.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });

    const closeBoth = () => {
      clientWs.close();
      upstream.close();
    };
    clientWs.on('close', closeBoth);
    upstream.on('close', closeBoth);
    upstream.on('error', (err) => {
      logger.error(`applyBotLive: upstream connection error for task ${taskId} — ${err.message}`);
      closeBoth();
    });
    // Found 2026-08-20 (code review): clientWs had no 'error' listener, unlike
    // upstream above. Node's EventEmitter throws when an 'error' event has no
    // registered listener — confirmed directly (a bare EventEmitter.emit('error',
    // ...) with zero listeners throws synchronously) — and this file has no
    // process-level uncaughtException handler to catch it. A single flaky or
    // malformed client connection (a dropped network mid-frame, a bad WS frame —
    // trivially triggerable by any user, not just an attacker) would otherwise
    // crash the ENTIRE backend process for every user, not just this one
    // connection — a much larger blast radius than a single dropped live-view
    // session warrants.
    clientWs.on('error', (err) => {
      logger.error(`applyBotLive: client connection error for task ${taskId} — ${err.message}`);
      closeBoth();
    });
  });

  logger.info('applyBotLive: WS proxy attached at /api/apply-bot/live/:taskId');
  return wss;
}

module.exports = { attachApplyBotLiveProxy };

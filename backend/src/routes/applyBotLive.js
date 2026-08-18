// applyBotLive.js (F7) — authenticated WS proxy between the frontend and
// apply-bot's live-view WS server (liveView.js). apply-bot has no public
// networking (same rule as resume-parser) — this proxy is the ONLY path a
// browser can ever reach it through.
//
// STATUS: scaffolded, not implemented, not wired into app.js. Requires the `ws`
// package (added to backend/package.json — run `npm install`) before this can be
// required at all.
//
// The real complexity here, flagged explicitly rather than hand-waved: a raw
// WebSocket upgrade (`server.on('upgrade', ...)`) does NOT go through Express's
// normal middleware chain — `req.session` is not populated the way it is for a
// regular HTTP request. Authenticating this connection means manually parsing the
// session cookie from the upgrade request's headers and looking it up against the
// same Redis session store `express-session` uses (see app.js's `RedisStore`
// setup) — don't skip this and trust the client-supplied taskId alone.
const { WebSocketServer, WebSocket } = require('ws');
const prisma = require('../db');
const logger = require('../logger');

const APPLY_BOT_INTERNAL_WS_URL = process.env.APPLY_BOT_INTERNAL_URL
  ? process.env.APPLY_BOT_INTERNAL_URL.replace(/^http/, 'ws') + '/live'
  : 'ws://localhost:8100/live';

// TODO(F7): call this from app.js after `const server = app.listen(...)`, e.g.
// `attachApplyBotLiveProxy(server);` — same "after listen, not at module scope"
// timing rule as the AI/scheduler workers.
function attachApplyBotLiveProxy(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    // TODO(F7): only intercept our own path — let any other upgrade request
    // (there shouldn't be one elsewhere in this app today, but be defensive)
    // pass through untouched rather than swallowing it.
    const url = new URL(req.url, 'http://internal');
    if (!url.pathname.startsWith('/api/apply-bot/live/')) return;

    // TODO(F7): parse & validate the session cookie here (see file header) —
    // reject with socket.destroy() before ever calling wss.handleUpgrade() if the
    // request isn't from an authenticated session that owns this ApplyTask.
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, req);
    });
  });

  wss.on('connection', async (clientWs, req) => {
    const url = new URL(req.url, 'http://internal');
    const taskId = url.pathname.split('/').pop();

    // TODO(F7): re-verify ownership here too (defense in depth, not just at the
    // upgrade step above) — a task that doesn't belong to the authenticated user,
    // or isn't currently paused, should close immediately rather than proxy.
    const task = await prisma.applyTask.findUnique({ where: { id: taskId } }).catch(() => null);
    if (!task) {
      clientWs.close(1008, 'task not found');
      return;
    }

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
  });

  logger.info('applyBotLive: WS proxy attached at /api/apply-bot/live/:taskId');
  return wss;
}

module.exports = { attachApplyBotLiveProxy };

// liveView.js (F7) — WS server implementing Contract B's server-side half
// (docs/apply-bot/TECHNICAL_PLAN.md, "Interface Contracts"). Kept as its own file,
// not folded into server.js, so server.js stays a thin entry point — decision made
// 2026-08-17 when this was scaffolded.
//
// Verified 2026-08-19 (F7): implemented against a real Playwright session — see
// docs/apply-bot/TEST_PLAN.md F7 and MEMORY.md.
//
// apply-bot has NO public networking (same rule as resume-parser) — this WS server
// must only ever be reached through backend/src/routes/applyBotLive.js's
// authenticated proxy, never directly from a browser. The X-Apply-Bot-Secret check
// below is what enforces that in practice (the proxy is the only caller that knows
// the secret); apply-bot itself has no other way to tell "is this really the
// backend's proxy" from "someone found this internal port."
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const logger = require('./logger');
const { getPausedSession, clearPausedSession } = require('./worker');

const FRAME_INTERVAL_MS = 1000; // per the plan's §4 — 1 FPS screenshot polling, not video

// Same constant-time comparison as backend/src/services/cryptoService.js's
// timingSafeEqualString — apply-bot has no DB and no cryptoService.js of its own
// (see backend/apply-bot/src/bullConnection.js's "own copy" precedent for small
// shared utilities), so this is a minimal inline mirror rather than a new shared
// file, matching TECHNICAL_PLAN.md's file-structure rule against adding files not
// already on that list.
function timingSafeEqualString(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hashB = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Attaches the live-view WS server to the apply-bot HTTP server. Call once from
// server.js, after app.listen() (same "workers/servers start after listen" rule as
// everything else in this codebase — see server.js's own comment).
function attachLiveView(httpServer) {
  // Verified 2026-08-19 (F7): the secret check MUST run in `verifyClient`, not
  // inside the `connection` handler. `ws` completes the WebSocket handshake (and
  // fires the client's `open` event) before `connection` ever runs — checking the
  // secret there and calling `ws.close()` only closes an already-accepted
  // connection a fraction of a second later, which is a real but subtle gap from
  // "never accepts an unauthorized handshake at all." Confirmed by testing both
  // ways: a `connection`-handler check let an unauthenticated client's `open`
  // event fire before the close; `verifyClient` (runs during the HTTP upgrade,
  // before any WS handshake response is sent) correctly rejects with a plain
  // HTTP 401 and the client's `open` event never fires.
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/live',
    verifyClient: (info, callback) => {
      const providedSecret = info.req.headers['x-apply-bot-secret'];
      const ok = Boolean(process.env.APPLY_BOT_SECRET) && timingSafeEqualString(providedSecret, process.env.APPLY_BOT_SECRET);
      callback(ok, ok ? undefined : 401, ok ? undefined : 'Unauthorized');
    },
  });

  wss.on('connection', (ws, req) => {
    const applyTaskId = new URL(req.url, 'http://internal').searchParams.get('taskId');
    const paused = getPausedSession(applyTaskId);
    if (!paused) {
      ws.close(1008, 'no paused session for this taskId');
      return;
    }
    const { session } = paused;

    let isTakingScreenshot = false; // guards against overlapping screenshot ticks, per the plan's §4
    const frameTimer = setInterval(async () => {
      if (isTakingScreenshot) return;
      isTakingScreenshot = true;
      try {
        const buffer = await session.page.screenshot({ type: 'jpeg', quality: 60 });
        const viewport = session.page.viewportSize() || { width: 1280, height: 800 };
        ws.send(JSON.stringify({
          type: 'frame',
          taskId: applyTaskId,
          image: `data:image/jpeg;base64,${buffer.toString('base64')}`,
          width: viewport.width,
          height: viewport.height,
          timestamp: Date.now(),
        }));
      } catch (err) {
        logger.warn(`liveView: screenshot tick failed for ${applyTaskId} — ${err.message}`);
      } finally {
        isTakingScreenshot = false;
      }
    }, FRAME_INTERVAL_MS);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // malformed message — ignore, don't crash the socket
      }

      const { page } = session;
      const viewport = page.viewportSize() || { width: 1280, height: 800 };

      if (msg.type === 'mouse') {
        // x/y arrive normalized 0..1 per Contract B — denormalize against the real
        // viewport before dispatching.
        const x = msg.x * viewport.width;
        const y = msg.y * viewport.height;
        if (msg.action === 'move') await page.mouse.move(x, y).catch(() => {});
        else if (msg.action === 'down') await page.mouse.down().catch(() => {});
        else if (msg.action === 'up') await page.mouse.up().catch(() => {});
        else if (msg.action === 'click') await page.mouse.click(x, y).catch(() => {});
        else if (msg.action === 'dblclick') await page.mouse.dblclick(x, y).catch(() => {});
        else if (msg.action === 'wheel') await page.mouse.wheel(msg.deltaX || 0, msg.deltaY || 0).catch(() => {});
      } else if (msg.type === 'keyboard') {
        if (msg.action === 'type' && msg.text) await page.keyboard.type(msg.text).catch(() => {});
        else if (msg.action === 'down' && msg.key) await page.keyboard.down(msg.key).catch(() => {});
        else if (msg.action === 'up' && msg.key) await page.keyboard.up(msg.key).catch(() => {});
      } else if (msg.type === 'mark-resolved') {
        // Resolves worker.js's waitForHumanResolution() promise for this task,
        // letting processTask() continue past the pause — this is the actual
        // resume, not just registry cleanup (see runTask()'s handleChallenge()
        // for what happens next: it re-checks the challenge is really gone before
        // trusting this signal).
        paused.resolve();
        clearPausedSession(applyTaskId);
        clearInterval(frameTimer);
        ws.send(JSON.stringify({ type: 'resumed', taskId: applyTaskId }));
      }
    });

    ws.on('close', () => clearInterval(frameTimer));
  });

  logger.info('liveView: WS server attached at /live');
  return wss;
}

module.exports = { attachLiveView };

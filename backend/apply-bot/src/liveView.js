// liveView.js (F7) — WS server implementing Contract B's server-side half
// (docs/apply-bot/TECHNICAL_PLAN.md, "Interface Contracts"). Kept as its own file,
// not folded into server.js, so server.js stays a thin entry point — decision made
// 2026-08-17 when this was scaffolded.
//
// STATUS: scaffolded, not implemented. Requires the `ws` package (added to
// package.json — run `npm install`) and worker.js's paused-session registry to
// actually be populated (see worker.js's TODO(F7) at its CAPTCHA-detected branches)
// before this can do anything real.
//
// apply-bot has NO public networking (same rule as resume-parser) — this WS server
// must only ever be reached through backend/src/routes/applyBotLive.js's
// authenticated proxy, never directly from a browser.
const { WebSocketServer } = require('ws');
const logger = require('./logger');
const { getPausedSession, clearPausedSession } = require('./worker');

const FRAME_INTERVAL_MS = 1000; // per the plan's §4 — 1 FPS screenshot polling, not video

// Attaches the live-view WS server to the apply-bot HTTP server. Call once from
// server.js, after app.listen() (same "workers/servers start after listen" rule as
// everything else in this codebase — see server.js's own comment).
function attachLiveView(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  wss.on('connection', (ws, req) => {
    // TODO(F7): verify req.headers['x-apply-bot-secret'] matches
    // process.env.APPLY_BOT_SECRET before doing anything else — the only expected
    // caller is backend/src/routes/applyBotLive.js's proxy, never a browser
    // directly (apply-bot has no public networking). Close immediately on mismatch.
    const applyTaskId = new URL(req.url, 'http://internal').searchParams.get('taskId');
    const session = getPausedSession(applyTaskId);
    if (!session) {
      ws.close(1008, 'no paused session for this taskId');
      return;
    }

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
        // TODO(F7): x/y arrive normalized 0..1 per Contract B — denormalize against
        // the real viewport before dispatching, exactly like this stub does below.
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
        // TODO(F7): this is where the paused task's awaited promise (see worker.js's
        // TODO at the CAPTCHA-detected branches) should actually resolve and let
        // processTask() continue past the pause. Wire that up here — right now this
        // only clears the registry entry and tells the frontend to stop rendering,
        // it does NOT yet resume the underlying task.
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

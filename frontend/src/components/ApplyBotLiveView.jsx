// ApplyBotLiveView.jsx (F11) — built against Contract B
// (docs/apply-bot/TECHNICAL_PLAN.md, "Interface Contracts"), independent of
// whether F7's real backend exists yet. Native browser WebSocket — no new
// dependency needed on the frontend.
//
// STATUS: scaffolded, not implemented, not imported/rendered anywhere yet. Wire it
// into AutoApply.jsx (render when a task's status is the pause state) once F7's
// backend proxy exists — see TEST_PLAN.md's F11 checklist for how to verify this
// independently first, against a stubbed WS server that plays back fixture frames.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

const PAUSE_INSTRUCTIONS = {
  captcha: 'Solve the CAPTCHA below, then click "I solved it, continue."',
  email_verification: 'Check the inbox this application used, find the verification code, enter it below, then click "I solved it, continue."',
  unknown_challenge: 'Something on this page needs your attention. Once resolved, click "I solved it, continue."',
};

export default function ApplyBotLiveView({ taskId, pauseReason }) {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    if (!taskId) return undefined;

    // TODO(F11): confirm the exact path once F7's backend proxy
    // (routes/applyBotLive.js) is implemented — this assumes
    // /api/apply-bot/live/:taskId per that file's own routing.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/apply-bot/live/${taskId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Contract B's server→client shapes — handled exhaustively here, this is
      // the ONE place this protocol gets parsed on the frontend, per the plan's
      // note that the backend proxy stays a dumb relay.
      if (msg.type === 'frame') {
        drawFrame(msg);
      } else if (msg.type === 'resumed' || msg.type === 'closed') {
        setConnected(false);
        // TODO(F11): notify the parent (AutoApply.jsx) to stop rendering this
        // component and refetch the task list — the task has moved on.
      }
      // 'pause' messages aren't expected here (this component only mounts once
      // already paused, via the `pauseReason` prop) but could be handled if the
      // reason changes mid-session (e.g. captcha → email_verification).
    };

    function drawFrame(msg) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setImageSize({ width: msg.width, height: msg.height });
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        canvas.width = msg.width;
        canvas.height = msg.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = msg.image;
    }

    return () => ws.close();
  }, [taskId]);

  // Normalizes a canvas-relative pointer event to Contract B's 0..1 coordinate
  // space before sending — the backend/apply-bot side denormalizes against the
  // real viewport (see liveView.js).
  function sendMouseEvent(action, e) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    ws.send(JSON.stringify({ type: 'mouse', taskId, action, x, y }));
  }

  function handleMarkResolved() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'mark-resolved', taskId }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        {PAUSE_INSTRUCTIONS[pauseReason] || PAUSE_INSTRUCTIONS.unknown_challenge}
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-inset ring-slate-200">
        <canvas
          ref={canvasRef}
          width={imageSize.width}
          height={imageSize.height}
          className="w-full cursor-pointer"
          onClick={(e) => sendMouseEvent('click', e)}
          onMouseMove={(e) => sendMouseEvent('move', e)}
          // TODO(F11): also relay keyboard input — needs the canvas to be
          // focusable (tabIndex) and an onKeyDown handler sending
          // { type: 'keyboard', taskId, action: 'down'|'up', key } per Contract B.
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{connected ? 'Live' : 'Connecting…'}</span>
        <Button size="sm" onClick={handleMarkResolved} disabled={!connected}>
          I solved it, continue
        </Button>
      </div>
    </div>
  );
}

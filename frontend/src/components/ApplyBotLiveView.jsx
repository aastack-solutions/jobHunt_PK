// ApplyBotLiveView.jsx (F11) — the screen a human gets when the bot hits something
// only a person can clear (a CAPTCHA, an emailed code). Implements the client half
// of Contract B (docs/apply-bot/TECHNICAL_PLAN.md, "Interface Contracts"); the
// server half is backend/apply-bot/src/liveView.js, proxied by
// backend/src/routes/applyBotLive.js at /api/apply-bot/live/:taskId.
//
// Native browser WebSocket — no new dependency. All message building and parsing
// lives in lib/liveViewProtocol.js so it can be tested without a browser; this file
// is deliberately only the parts that genuinely need one.
//
// On the UX risk the plan flags — "here's a live browser controlled by a bot, using
// your credentials" is alarming if presented badly — the framing here is: say
// plainly whose session this is and what is being asked, show the destination, and
// make "I solved it" the obvious single next action. No hidden automation running
// while the human watches: the bot is stopped and waiting.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import {
  PAUSE_INSTRUCTIONS,
  normalizePoint,
  buildMouseMessage,
  buildKeyboardMessage,
  buildMarkResolvedMessage,
  parseServerMessage,
} from '../lib/liveViewProtocol';
import Button from './ui/Button';
import Input from './ui/Input';

// A pointer move per rendered frame is plenty; unthrottled onMouseMove fires far
// faster than the far side can act on and would flood a socket carrying screenshots.
const MOUSE_MOVE_INTERVAL_MS = 50;

export default function ApplyBotLiveView({ taskId, pauseReason, applyUrl, onFinished }) {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const lastMoveSentAt = useRef(0);

  const [status, setStatus] = useState('connecting'); // connecting | live | finished | error
  const [reason, setReason] = useState(pauseReason || 'unknown_challenge');
  const [instructions, setInstructions] = useState(PAUSE_INSTRUCTIONS[pauseReason] || PAUSE_INSTRUCTIONS.unknown_challenge);
  const [codeInput, setCodeInput] = useState('');

  const send = useCallback((message) => {
    const ws = wsRef.current;
    // A null message means the protocol module rejected it — dropping is correct,
    // the alternative is sending something the far side cannot act on.
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    if (!taskId) return undefined;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/apply-bot/live/${taskId}`);
    wsRef.current = ws;

    ws.onopen = () => setStatus('live');
    ws.onerror = () => setStatus('error');

    ws.onmessage = (event) => {
      const msg = parseServerMessage(event.data);
      if (!msg) return; // malformed frame: drop it, never tear down a live session

      if (msg.type === 'frame') {
        drawFrame(msg);
      } else if (msg.type === 'pause') {
        // The reason can change mid-session (a CAPTCHA cleared, then an emailed
        // code asked for) — follow it rather than trusting the mount-time prop.
        setReason(msg.pauseReason);
        setInstructions(msg.instructions);
      } else if (msg.type === 'resumed' || msg.type === 'closed') {
        setStatus('finished');
        onFinished?.(msg.type);
      }
    };

    // Distinguished from onerror: a close after a resume is the happy path.
    ws.onclose = () => setStatus((s) => (s === 'finished' ? s : 'error'));

    function drawFrame(msg) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        // Sized from the frame itself so the canvas backing store always matches
        // the screenshot; CSS scales it down to fit. Pointer coordinates are
        // normalized against the rendered rect, so the two never have to agree.
        canvas.width = msg.width;
        canvas.height = msg.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
      };
      img.src = msg.image; // validated by parseServerMessage as a data: image URL
    }

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [taskId, onFinished]);

  function pointFrom(e) {
    return normalizePoint(canvasRef.current?.getBoundingClientRect(), e.clientX, e.clientY);
  }

  function handleMouse(action, e) {
    if (action === 'move') {
      const now = Date.now();
      if (now - lastMoveSentAt.current < MOUSE_MOVE_INTERVAL_MS) return;
      lastMoveSentAt.current = now;
    }
    send(buildMouseMessage(taskId, action, pointFrom(e)));
  }

  function handleKeyDown(e) {
    // Printable characters go as 'type' so the far side inserts text; everything
    // else (Enter, Backspace, Tab, arrows) goes as a named key press.
    if (e.key.length === 1) send(buildKeyboardMessage(taskId, 'type', { text: e.key }));
    else send(buildKeyboardMessage(taskId, 'down', { key: e.key }));
    // Tab and space would otherwise scroll or move focus out of the canvas.
    if (['Tab', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  }

  // Typing a code into a normal input and sending it in one go is far easier than
  // clicking into a remote field pixel-perfectly — the common case for an emailed
  // verification code.
  function sendCode() {
    if (!codeInput) return;
    send(buildKeyboardMessage(taskId, 'type', { text: codeInput }));
    setCodeInput('');
  }

  const isLive = status === 'live';

  if (status === 'finished') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800">
        <ShieldCheck className="h-4 w-4 flex-shrink-0" />
        Thanks — the bot has picked up where it left off.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="font-semibold">The bot is paused and waiting for you.</span>
          <span>{instructions}</span>
          {applyUrl && (
            <span className="text-xs text-amber-800/80">
              This is the live page at <span className="font-medium">{safeHost(applyUrl)}</span>, signed in with the
              credential you saved. Nothing is submitted until you continue.
            </span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-inset ring-slate-200">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Live view of the paused application page"
          className="w-full cursor-pointer outline-none focus:ring-2 focus:ring-brand-violet/60"
          onClick={(e) => handleMouse('click', e)}
          onDoubleClick={(e) => handleMouse('dblclick', e)}
          onMouseDown={(e) => handleMouse('down', e)}
          onMouseUp={(e) => handleMouse('up', e)}
          onMouseMove={(e) => handleMouse('move', e)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {reason === 'email_verification' && (
        <div className="flex items-end gap-2">
          <Input
            label="Verification code"
            name="liveViewCode"
            className="flex-1"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Paste the code from your inbox"
            disabled={!isLive}
          />
          <Button variant="secondary" onClick={sendCode} disabled={!isLive || !codeInput}>
            Send code
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {status === 'connecting' && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === 'connecting' && 'Connecting to the paused session…'}
          {status === 'live' && 'Live — click and type directly on the page above'}
          {status === 'error' && 'Connection lost. Close this and reopen from the task list.'}
        </span>
        <Button size="sm" onClick={() => send(buildMarkResolvedMessage(taskId))} disabled={!isLive}>
          I solved it, continue
        </Button>
      </div>
    </div>
  );
}

// Shows the destination without trusting the string enough to render it as a link.
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'the employer’s site';
  }
}

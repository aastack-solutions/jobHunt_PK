# 03 — Failure Measurement

The `ApplyTask` table (`backend/prisma/schema.prisma`) was designed to make these
metrics answerable without adding any new instrumentation — `status`, `failureClass`,
`confidenceScore`, `captchaDetectedAt`/`captchaSolvedAt`, and `adapterUsed` are
already captured on every attempt. This doc defines the metrics and gives the
Prisma/SQL to compute them. None of this can run yet (§02.1 — no migration applied),
but it's ready the moment real `ApplyTask` rows exist.

## Core metrics

### 1. Submission success rate
The headline number: of everything the bot attempted, how much actually went
through (or, in shadow mode, would have).
```
success_rate = count(status IN ('submitted', 'shadow_complete'))
             / count(status NOT IN ('queued', 'running', 'paused_captcha'))
```
Excludes in-flight tasks (queued/running/paused) since they haven't resolved yet.

### 2. Abstain rate
How often the bot decided *not* to guess, rather than failing outright. High is not
automatically bad — it means the safety rail is doing its job — but a rising trend
on a platform that was previously fine is a signal something changed (§4 below).
```
abstain_rate = count(status = 'skipped_low_confidence') / count(status NOT IN ('queued','running'))
```

### 3. CAPTCHA-hit rate
Proxy for bot-detection risk and for whether session-state reuse (§01-F) is actually
reducing login friction over time.
```
captcha_rate = count(captchaDetectedAt IS NOT NULL) / count(*)
```
Worth segmenting: CAPTCHA rate on tasks that reused a saved `sessionState` vs. tasks
that logged in fresh. If reuse isn't measurably lowering this, §01-F's assumption
needs revisiting.

### 4. Failure-class breakdown
The single most useful query for deciding *what to fix next* — tells you where the
problem actually is instead of one undifferentiated "failed" bucket.
```js
// Prisma
const breakdown = await prisma.applyTask.groupBy({
  by: ['failureClass'],
  where: { status: 'failed' },
  _count: true,
});
```
Reading it:
- `PORTAL_LAYOUT` clustering on one adapter → selectors drifted, go fix that adapter
  (§02.3).
- `AUTH` clustering → a stored credential's password is stale/wrong, or the platform
  changed its login flow.
- `TIMEOUT`/`NETWORK` → likely infra/connectivity, not an adapter bug — check apply-bot
  service health before touching adapter code.
- `CAPTCHA` → expected some of the time in Phase 1 (no live-view yet, so it's always
  terminal) — this number *should* drop once Phase 2's live-view ships, so it's also
  a before/after metric for that work.

### 5. Per-adapter success rate
```js
const perAdapter = await prisma.applyTask.groupBy({
  by: ['adapterUsed', 'status'],
  _count: true,
});
```
Directly answers "which of Greenhouse/Lever/Ashby needs selector maintenance right
now" — the whole reason §02.3's fix is framed as ongoing work, not a one-time task.

### 6. Confidence-score distribution
```js
const scores = await prisma.applyTask.findMany({
  where: { confidenceScore: { not: null } },
  select: { confidenceScore: true, status: true },
});
```
Bucket into a histogram (0-39 / 40-59 / 60-79 / 80-100). The gap right below
`MIN_CONFIDENCE_TO_FILL` (60, in `fieldTaxonomy.js`) is exactly what §04 uses to
decide whether the threshold or the synonym list needs adjusting.

### 7. Cap/volume sanity check
```js
const todaysCount = await prisma.applyTask.count({
  where: { userId, createdAt: { gte: startOfToday } },
});
```
Same query `applyBotSelect.js` already uses internally — worth running manually
after the first few real runs to confirm the cap is actually being respected end to
end, not just in the selection logic's unit behavior.

## Suggested alert threshold (borrowed from the existing `SchedulerAlert` pattern)

The frontend already has a precedent for this:
`frontend/src/components/SchedulerAlert.jsx` shows a red banner if the daily job
fetch hasn't run in >25 hours, or if a job source shows 0 results for 3+ consecutive
days. Apply the same pattern here once volume is high enough to be meaningful:

- **Per-adapter failure rate > 50% over the last 20 attempts** → surface a banner
  ("Greenhouse adapter may need selector updates") rather than silently continuing
  to burn through the daily cap on tasks that are likely to fail.
- **CAPTCHA rate rising week-over-week on a platform that was previously stable** →
  possible sign of increased bot-detection scrutiny — worth flagging before it turns
  into account-level friction.

Not worth building this alert UI before real data exists to calibrate the
thresholds against — start by running the queries above manually after each shadow
batch.

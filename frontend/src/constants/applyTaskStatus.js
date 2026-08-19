export const APPLY_TASK_STATUSES = [
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  // F7 generalized this from 'paused_captcha' — the backend has only ever written
  // 'paused_human' since. pauseReason says WHICH kind of hand-off it is.
  { value: 'paused_human', label: 'Needs you' },
  { value: 'shadow_complete', label: 'Shadow: ready' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped_low_confidence', label: 'Skipped: low confidence' },
  { value: 'skipped_duplicate', label: 'Skipped: duplicate' },
  { value: 'skipped_cap_reached', label: 'Skipped: daily cap' },
  { value: 'unknown_outcome', label: 'Needs manual check' },
];

export function getApplyTaskStatusLabel(value) {
  const found = APPLY_TASK_STATUSES.find((s) => s.value === value);
  return found ? found.label : value;
}

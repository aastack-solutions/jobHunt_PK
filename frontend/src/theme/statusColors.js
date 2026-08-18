export function getStatusColor(status) {
  const map = {
    applied: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500' },
    viewed: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200', dot: 'bg-violet-500' },
    phone_screen: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500' },
    interview: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200', dot: 'bg-orange-500' },
    technical: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', dot: 'bg-indigo-500' },
    offer: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
    rejected: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200', dot: 'bg-rose-500' },
    withdrawn: { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-200', dot: 'bg-slate-400' },
  };
  return map[status] || map.applied;
}

export function getApplyTaskStatusColor(status) {
  const map = {
    queued: { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-200', dot: 'bg-slate-400' },
    running: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500' },
    paused_captcha: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500' },
    shadow_complete: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200', dot: 'bg-violet-500' },
    submitted: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
    failed: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200', dot: 'bg-rose-500' },
    skipped_low_confidence: { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-200', dot: 'bg-slate-400' },
    skipped_duplicate: { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-200', dot: 'bg-slate-400' },
    skipped_cap_reached: { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-200', dot: 'bg-slate-400' },
    // Distinct from both 'failed' (rose) and 'paused_captcha' (amber) — this status
    // means the outcome is genuinely unknown and blocks that job from ever being
    // retried until a human resolves it, so it should read as more urgent than a
    // normal failure, not just another shade of the same color.
    unknown_outcome: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200', dot: 'bg-orange-500' },
  };
  return map[status] || map.queued;
}

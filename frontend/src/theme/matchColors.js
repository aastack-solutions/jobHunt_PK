export function getMatchColor(score) {
  if (score >= 85)
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500', label: 'Excellent' };
  if (score >= 70)
    return { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500', label: 'Good' };
  if (score >= 50)
    return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500', label: 'Fair' };
  return { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-200', dot: 'bg-slate-400', label: 'Low' };
}

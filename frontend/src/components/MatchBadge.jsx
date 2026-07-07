import { getMatchColor } from '../theme/matchColors';

export default function MatchBadge({ score }) {
  // Un-scored jobs (before the matching engine runs) show a neutral "New" pill.
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> New
      </span>
    );
  }
  const { bg, text, ring, dot, label } = getMatchColor(score);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${bg} ${text} ${ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label} · {Math.round(score)}%
    </span>
  );
}

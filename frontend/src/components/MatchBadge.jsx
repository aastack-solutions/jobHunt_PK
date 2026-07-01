import { getMatchColor } from '../theme/matchColors';

export default function MatchBadge({ score }) {
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

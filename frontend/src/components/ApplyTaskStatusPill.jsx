import { getApplyTaskStatusColor } from '../theme/statusColors';
import { getApplyTaskStatusLabel } from '../constants/applyTaskStatus';

export default function ApplyTaskStatusPill({ status }) {
  const { bg, text, ring, dot } = getApplyTaskStatusColor(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${bg} ${text} ${ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {getApplyTaskStatusLabel(status)}
    </span>
  );
}

import { getStatusColor } from '../theme/statusColors';
import { getStatusLabel } from '../constants/appStatus';

export default function StatusPill({ status }) {
  const { bg, text, ring, dot } = getStatusColor(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${bg} ${text} ${ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {getStatusLabel(status)}
    </span>
  );
}

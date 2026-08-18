import { format } from 'date-fns';
import { Bot, Ghost } from 'lucide-react';
import LocationTypePill from './LocationTypePill';
import StatusPill from './StatusPill';
import { APP_STATUSES } from '../constants/appStatus';
import { truncate } from '../lib/format';

export default function ApplicationRow({ application, onStatusChange }) {
  return (
    <tr className="border-b border-slate-100/70 text-sm transition-colors hover:bg-white/50">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-slate-800">{application.jobTitle}</p>
          {application.source === 'auto_apply_bot' && (
            <span title="Submitted by the auto-apply bot" className="flex h-4 w-4 items-center justify-center rounded bg-violet-100 text-violet-600">
              <Bot className="h-2.5 w-2.5" />
            </span>
          )}
          {application.isGhosted && (
            <span title="No update in a while — likely ghosted" className="flex h-4 w-4 items-center justify-center rounded bg-slate-200 text-slate-500">
              <Ghost className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">{application.company}</p>
      </td>
      <td className="px-4 py-3.5">
        <LocationTypePill locationType={application.locationType} />
      </td>
      <td className="px-4 py-3.5">
        <StatusPill status={application.status} />
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
        {format(new Date(application.appliedAt), 'dd MMM yyyy')}
      </td>
      <td className="px-4 py-3.5 text-slate-500">{truncate(application.notes, 60)}</td>
      <td className="px-4 py-3.5">
        <select
          value={application.status}
          onChange={(e) => onStatusChange?.(application.id, e.target.value)}
          className="rounded-lg border-0 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none ring-1 ring-inset ring-slate-200 transition-all focus:ring-2 focus:ring-brand-violet/50"
        >
          {APP_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

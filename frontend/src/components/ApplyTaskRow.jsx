import { format } from 'date-fns';
import ApplyTaskStatusPill from './ApplyTaskStatusPill';

const ADAPTER_LABELS = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', generic: 'Generic' };

export default function ApplyTaskRow({ task }) {
  return (
    <tr className="border-b border-slate-100/70 text-sm transition-colors hover:bg-white/50">
      <td className="px-4 py-3.5">
        <p className="font-semibold text-slate-800">{task.jobTitle || '(job no longer available)'}</p>
        <p className="text-xs text-slate-500">{task.company}</p>
      </td>
      <td className="px-4 py-3.5 text-slate-600">{ADAPTER_LABELS[task.adapterUsed] || task.adapterUsed}</td>
      <td className="px-4 py-3.5">
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium capitalize text-slate-600 ring-1 ring-inset ring-slate-200">
          {task.mode}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <ApplyTaskStatusPill status={task.status} />
      </td>
      <td className="px-4 py-3.5 text-slate-500">
        {task.confidenceScore != null ? `${task.confidenceScore}%` : '—'}
      </td>
      <td className="px-4 py-3.5 max-w-xs truncate text-slate-500" title={task.failureReason || ''}>
        {task.failureReason || '—'}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
        {format(new Date(task.createdAt), 'dd MMM, HH:mm')}
      </td>
    </tr>
  );
}

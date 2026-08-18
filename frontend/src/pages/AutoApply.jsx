import { Bot } from 'lucide-react';
import { useApplyTasks } from '../hooks/useApplyTasks';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ApplyTaskRow from '../components/ApplyTaskRow';

// Phase 1: read-only audit trail. Tasks are created by the backend's
// applyBotSelect.js (manually triggered for now, not yet on the daily scheduler)
// and run in shadow mode by default — nothing here is actually submitted until
// Phase 2's live-mode + CAPTCHA live-view ship. See the plan for the full rollout.
export default function AutoApply() {
  const { tasks, isLoading } = useApplyTasks();

  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Auto-Apply</h1>
        <p className="text-sm text-slate-500">
          Audit trail for the auto-apply bot — Greenhouse/Lever/Ashby only, shadow mode by default.
        </p>
      </div>

      {Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([status, count]) => (
            <span
              key={status}
              className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
            >
              {status.replace(/_/g, ' ')}: <span className="font-bold text-brand-navy">{count}</span>
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="skeleton h-48 rounded-3xl" />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No auto-apply tasks yet"
          description="Tasks appear here once the daily selection step runs and finds eligible Greenhouse/Lever/Ashby matches."
        />
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Adapter</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <ApplyTaskRow key={t.id} task={t} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

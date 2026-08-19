import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Hand } from 'lucide-react';
import { useApplyTasks } from '../hooks/useApplyTasks';
import { QUERY_KEYS } from '../constants/queryKeys';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ApplyTaskRow from '../components/ApplyTaskRow';
import ApplyBotLiveView from '../components/ApplyBotLiveView';

export default function AutoApply() {
  const { tasks, isLoading } = useApplyTasks();
  const queryClient = useQueryClient();
  const [liveTask, setLiveTask] = useState(null);

  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  // F11 — the whole point of the live-view: a task sitting at 'paused_human' is
  // doing nothing at all until a person clears whatever stopped it, and it times
  // out if left (see applyBotSweep's PAUSED_STALE_MS). So it gets its own banner at
  // the top rather than just a differently-coloured row in a long table.
  const pausedTasks = tasks.filter((t) => t.status === 'paused_human');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Auto-Apply</h1>
        <p className="text-sm text-slate-500">What the bot has attempted on your behalf.</p>
      </div>

      {pausedTasks.length > 0 && (
        <Card className="flex flex-col gap-3 border-amber-200/70 bg-amber-50/60">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
              <Hand className="h-4.5 w-4.5 text-amber-600" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                {pausedTasks.length === 1 ? 'An application needs you' : `${pausedTasks.length} applications need you`}
              </h3>
              <p className="text-xs text-amber-800/80">
                The bot has stopped on these and is holding the page open. They time out if left too long.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {pausedTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.jobTitle || '(job no longer available)'}</p>
                  <p className="truncate text-xs text-slate-500">{t.company}</p>
                </div>
                <Button size="sm" onClick={() => setLiveTask(t)}>Open</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <span
            key={status}
            className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium capitalize text-slate-600 ring-1 ring-inset ring-slate-200"
          >
            {status.replace(/_/g, ' ')}: <span className="font-bold text-brand-navy">{count}</span>
          </span>
        ))}
      </div>

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

      <Modal
        isOpen={Boolean(liveTask)}
        onClose={() => setLiveTask(null)}
        size="xl"
        title={liveTask ? `${liveTask.jobTitle || 'Application'} — ${liveTask.company || ''}` : ''}
      >
        {liveTask && (
          <ApplyBotLiveView
            taskId={liveTask.id}
            pauseReason={liveTask.pauseReason}
            applyUrl={liveTask.applyUrl}
            // Once the bot resumes, this task has moved on — refetch so the list
            // and the banner above stop showing it as needing a human.
            onFinished={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.APPLY_TASKS })}
          />
        )}
      </Modal>
    </div>
  );
}

import { AlertTriangle } from 'lucide-react';

const HOURS_25_MS = 25 * 60 * 60 * 1000;

export default function SchedulerAlert({ lastRunAt }) {
  const overdue = !lastRunAt || Date.now() - new Date(lastRunAt).getTime() > HOURS_25_MS;
  if (!overdue) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm backdrop-blur-md animate-slide-up">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-100">
        <AlertTriangle className="h-5 w-5 text-rose-500" />
      </span>
      Daily job fetch has not run in the last 25 hours. Check scheduler.
    </div>
  );
}

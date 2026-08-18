import { AlertTriangle } from 'lucide-react';

const HOURS_25_MS = 25 * 60 * 60 * 1000;

function AlertBanner({ children }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm backdrop-blur-md animate-slide-up">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-100">
        <AlertTriangle className="h-5 w-5 text-rose-500" />
      </span>
      {children}
    </div>
  );
}

export default function SchedulerAlert({ lastRunAt, applyBotLastRunAt, applyBotNeedsReview }) {
  const jobFetchOverdue = !lastRunAt || Date.now() - new Date(lastRunAt).getTime() > HOURS_25_MS;

  // Only alarm about the auto-apply bot once it has actually run at least once —
  // a team that hasn't turned the feature on yet shouldn't see a false "overdue".
  const applyBotOverdue = applyBotLastRunAt && Date.now() - new Date(applyBotLastRunAt).getTime() > HOURS_25_MS;

  const needsReview = applyBotNeedsReview > 0;

  if (!jobFetchOverdue && !applyBotOverdue && !needsReview) return null;

  return (
    <div className="flex flex-col gap-2">
      {jobFetchOverdue && <AlertBanner>Daily job fetch has not run in the last 25 hours. Check scheduler.</AlertBanner>}
      {applyBotOverdue && <AlertBanner>Auto-apply selection has not run in the last 25 hours. Check scheduler.</AlertBanner>}
      {needsReview && (
        <AlertBanner>
          {applyBotNeedsReview} auto-apply {applyBotNeedsReview === 1 ? 'task needs' : 'tasks need'} manual
          review — the real outcome on the employer's site is unconfirmed after a
          worker crash. Check the Auto-Apply page before this job is retried or
          assumed applied.
        </AlertBanner>
      )}
    </div>
  );
}

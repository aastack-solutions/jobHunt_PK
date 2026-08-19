import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getApplyTasks } from '../api/applyBot';

// 'paused_human' is the important one here, and was previously listed under its
// pre-F7 name 'paused_captcha' — a value the backend has not written since F7
// renamed it. The effect was that the moment a task actually needed a human, the
// 5s refetch stopped, so the UI never noticed. Fixed 2026-08-19 (F11).
const ACTIVE_STATUSES = new Set(['queued', 'running', 'paused_human']);

// List-with-live-status — React Query's refetchInterval, per frontend/CLAUDE.md's
// data-fetching rule (this is a list, not the single-job AI polling contract that
// useAITask.js owns).
export function useApplyTasks() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.APPLY_TASKS,
    queryFn: getApplyTasks,
    refetchInterval: (query) => {
      const tasks = query.state.data || [];
      return tasks.some((t) => ACTIVE_STATUSES.has(t.status)) ? 5000 : false;
    },
  });

  return { tasks: data ?? [], isLoading, error };
}

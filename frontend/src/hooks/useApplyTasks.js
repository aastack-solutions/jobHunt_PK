import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getApplyTasks } from '../api/applyBot';

const ACTIVE_STATUSES = new Set(['queued', 'running', 'paused_captcha']);

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

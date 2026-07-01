import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getDashboardStats } from '../api/dashboard';

export function useDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.DASHBOARD,
    queryFn: getDashboardStats,
  });

  return { data, isLoading, error };
}

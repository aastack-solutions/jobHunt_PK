import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getJobs } from '../api/jobs';

export function useJobs(filters = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.JOBS(filters),
    queryFn: () => getJobs(filters),
  });

  return { jobs: data ?? [], isLoading, error, refetch };
}

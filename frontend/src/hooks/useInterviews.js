import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import {
  getInterviews,
  createInterview,
  updateInterview,
} from '../api/interviews';

export function useInterviews() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.INTERVIEWS,
    queryFn: getInterviews,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INTERVIEWS });

  const create = useMutation({
    mutationFn: createInterview,
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, updates }) => updateInterview(id, updates),
    onSuccess: invalidate,
  });

  return { interviews: data ?? [], isLoading, error, create, update };
}

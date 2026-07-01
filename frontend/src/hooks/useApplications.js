import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import {
  getApplications,
  createApplication,
  updateApplication,
} from '../api/applications';

export function useApplications(filters = {}) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.APPLICATIONS(filters),
    queryFn: () => getApplications(filters),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['applications'] });

  const create = useMutation({
    mutationFn: createApplication,
    onSuccess: invalidate,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, updates }) => updateApplication(id, updates),
    onSuccess: invalidate,
  });

  return {
    applications: data ?? [],
    isLoading,
    error,
    create,
    updateStatus,
  };
}

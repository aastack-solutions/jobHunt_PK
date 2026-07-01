import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ROUTES } from '../constants/routes';
import * as authApi from '../api/auth';

// Auth state lives in the React Query cache (QUERY_KEYS.ME) so every component
// that calls useAuth shares the same user without a separate context provider.
export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: authApi.getMe,
    staleTime: Infinity,
  });

  async function login(email, password) {
    const loggedIn = await authApi.login(email, password);
    queryClient.setQueryData(QUERY_KEYS.ME, loggedIn);
    return loggedIn;
  }

  async function register(email, password, fullName) {
    // Backend sets the session on register, so we're immediately logged in.
    const created = await authApi.register(email, password, fullName);
    queryClient.setQueryData(QUERY_KEYS.ME, created);
    return created;
  }

  async function logout() {
    await authApi.logout();
    queryClient.setQueryData(QUERY_KEYS.ME, null);
    navigate(ROUTES.LOGIN);
  }

  return { user: user ?? null, isLoading, login, register, logout };
}

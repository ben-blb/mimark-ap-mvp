import { type LoginInput, SessionDto } from '@mimark/contracts/session';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api-client';

export const sessionKey = ['session'] as const;

/** Sesión actual, o null si no hay. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () =>
      api.get('/session', SessionDto).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post('/session', input, SessionDto),
    onSuccess: (session) => queryClient.setQueryData(sessionKey, session),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/session'),
    onSuccess: () => {
      // Sin sesión, RequireSession manda a /login. El resto de datos en caché se descarta.
      queryClient.setQueryData(sessionKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
    },
  });
}

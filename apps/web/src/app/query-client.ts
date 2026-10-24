import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { sessionKey } from '../features/session/session.api';
import { ApiError } from '../lib/api-client';

/** Si cualquier llamada responde 401, la sesión terminó: RequireSession manda a /login. */
function onError(error: Error): void {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(sessionKey, null);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Solo se reintenta lo que puede mejorar solo: red o errores 5xx.
      retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
    },
  },
});

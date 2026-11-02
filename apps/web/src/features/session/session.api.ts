import { can, type Permission } from '@mimark/contracts/permissions';
import {
  type ChangePasswordInput,
  type LoginInput,
  SessionDto,
  type SetupInput,
  SetupStatus,
} from '@mimark/contracts/session';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api-client';

export const sessionKey = ['session'] as const;
export const setupKey = ['setup'] as const;

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

/** ¿El rol de la sesión tiene este permiso? Sin sesión, nunca. Solo decide qué mostrar: la API es la barrera. */
export function useCan(): (permission: Permission) => boolean {
  const session = useSession();
  return (permission) => !!session.data && can(session.data.role, permission);
}

/** ¿Falta la configuración inicial (no existe ningún usuario)? */
export function useSetupStatus() {
  return useQuery({
    queryKey: setupKey,
    queryFn: () => api.get('/setup', SetupStatus),
    staleTime: 0,
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

export function useSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInput) => api.post('/setup', input, SessionDto),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
      void queryClient.invalidateQueries({ queryKey: setupKey });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/session/password', input, SessionDto),
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

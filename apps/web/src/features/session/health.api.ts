import { Health } from '@mimark/contracts/health';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

/** Cada cuántos ms se vuelve a preguntar mientras la base no responda bien. */
export const HEALTH_RETRY_MS = 3_000;

/**
 * Estado de la base (spec 016). La consulta misma despierta la instancia de Neon; mientras no
 * llegue `db: 'ok'` (error, falla o respuesta inválida) se repite sola.
 */
export function useDbHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health', Health),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.db === 'ok' ? false : HEALTH_RETRY_MS),
  });
}

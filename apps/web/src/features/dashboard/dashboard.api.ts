import { DashboardDto, type Horizon } from '@mimark/contracts/dashboard';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

/** Llave de las consultas del tablero: las acciones sobre expedientes la invalidan. */
export const dashboardKey = ['dashboard'] as const;

export function useDashboard(horizon: Horizon) {
  return useQuery({
    queryKey: [...dashboardKey, horizon] as const,
    queryFn: () => api.get(`/dashboard?horizon=${horizon}`, DashboardDto),
    // Al cambiar de horizonte se sigue viendo el anterior hasta que llega el nuevo: sin parpadeo ni recarga.
    placeholderData: keepPreviousData,
  });
}

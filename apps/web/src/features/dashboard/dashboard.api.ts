import { DashboardDto, type Horizon } from '@mimark/contracts/dashboard';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export function useDashboard(horizon: Horizon) {
  return useQuery({
    queryKey: ['dashboard', horizon] as const,
    queryFn: () => api.get(`/dashboard?horizon=${horizon}`, DashboardDto),
    // Al cambiar de horizonte se sigue viendo el anterior hasta que llega el nuevo: sin parpadeo ni recarga.
    placeholderData: keepPreviousData,
  });
}

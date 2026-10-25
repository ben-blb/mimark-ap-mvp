import {
  PayableDto,
  PayableHistory,
  PayableList,
  type PayableListQuery,
} from '@mimark/contracts/payables';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Query keys y llamadas de la feature en un solo archivo. Los componentes no hacen fetch. */
export const payableKeys = {
  all: ['payables'] as const,
  list: (query: Partial<PayableListQuery>) => ['payables', 'list', query] as const,
  detail: (id: string) => ['payables', 'detail', id] as const,
  history: (id: string) => ['payables', 'history', id] as const,
};

export function usePayables(query: Partial<PayableListQuery>) {
  return useQuery({
    queryKey: payableKeys.list(query),
    queryFn: () => api.get(`/payables${toQuery(query)}`, PayableList),
  });
}

export function usePayable(id: string) {
  return useQuery({
    queryKey: payableKeys.detail(id),
    queryFn: () => api.get(`/payables/${id}`, PayableDto),
  });
}

export function usePayableHistory(id: string) {
  return useQuery({
    queryKey: payableKeys.history(id),
    queryFn: () => api.get(`/payables/${id}/history`, PayableHistory),
  });
}

export function useUploadPayable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload('/payables', form, PayableDto),
    // También si falla con 502: el expediente quedó creado en estado «failed».
    onSettled: () => queryClient.invalidateQueries({ queryKey: payableKeys.all }),
  });
}

export function useRetryPayable(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/payables/${id}/retry`, undefined, PayableDto),
    onSettled: () => queryClient.invalidateQueries({ queryKey: payableKeys.all }),
  });
}

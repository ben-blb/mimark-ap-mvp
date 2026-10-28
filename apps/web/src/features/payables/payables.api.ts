import {
  type CorrectFieldsInput,
  type DiscardInput,
  type DocumentsInput,
  PayableDto,
  PayableHistory,
  PayableList,
  type PayableListFilters,
  type PaymentInput,
  type ScheduleInput,
} from '@mimark/contracts/payables';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';
import { dashboardKey } from '../dashboard/dashboard.api';

/** Query keys y llamadas de la feature en un solo archivo. Los componentes no hacen fetch. */
export const payableKeys = {
  all: ['payables'] as const,
  list: (query: PayableListFilters) => ['payables', 'list', query] as const,
  detail: (id: string) => ['payables', 'detail', id] as const,
  history: (id: string) => ['payables', 'history', id] as const,
};

export function usePayables(query: PayableListFilters) {
  return useQuery({
    queryKey: payableKeys.list(query),
    queryFn: () => api.get(`/payables${toQuery(query)}`, PayableList),
  });
}

export function usePayable(id: string, enabled = true) {
  return useQuery({
    queryKey: payableKeys.detail(id),
    queryFn: () => api.get(`/payables/${id}`, PayableDto),
    enabled,
  });
}

export function usePayableHistory(id: string) {
  return useQuery({
    queryKey: payableKeys.history(id),
    queryFn: () => api.get(`/payables/${id}/history`, PayableHistory),
  });
}

/** Cualquier cambio en un expediente mueve la lista, el detalle, el historial y los totales del tablero. */
function invalidatePayables(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: payableKeys.all }),
    queryClient.invalidateQueries({ queryKey: dashboardKey }),
  ]);
}

export function useUploadPayable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload('/payables', form, PayableDto),
    // También si falla con 502: el expediente quedó creado en estado «failed».
    onSettled: () => invalidatePayables(queryClient),
  });
}

export function useRetryPayable(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/payables/${id}/retry`, undefined, PayableDto),
    onSettled: () => invalidatePayables(queryClient),
  });
}

/** Una acción de una persona sobre el expediente. Al terminar (o fallar) se recarga todo lo de expedientes. */
function useAction<I>(run: (input: I) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => invalidatePayables(queryClient),
  });
}

export const useCorrectPayable = (id: string) =>
  useAction((input: CorrectFieldsInput) => api.patch(`/payables/${id}/fields`, input, PayableDto));
export const useConfirmPayable = (id: string) =>
  useAction(() => api.post(`/payables/${id}/confirm`, undefined, PayableDto));
export const useSchedulePayable = (id: string) =>
  useAction((input: ScheduleInput) => api.post(`/payables/${id}/schedule`, input, PayableDto));
export const usePayPayable = (id: string) =>
  useAction((input: PaymentInput) => api.post(`/payables/${id}/payment`, input, PayableDto));
export const useDocumentsPayable = (id: string) =>
  useAction((input: DocumentsInput) => api.patch(`/payables/${id}/documents`, input, PayableDto));
export const useDiscardPayable = (id: string) =>
  useAction((input: DiscardInput) => api.post(`/payables/${id}/discard`, input, PayableDto));

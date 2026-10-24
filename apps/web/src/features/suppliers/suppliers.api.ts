import {
  type CreateSupplierInput,
  SupplierDto,
  SupplierList,
  type SupplierListQuery,
  type UpdateSupplierInput,
} from '@mimark/contracts/suppliers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Query keys y llamadas de la feature en un solo archivo. Los componentes no hacen fetch. */
export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (query: Partial<SupplierListQuery>) => ['suppliers', 'list', query] as const,
};

export function useSuppliers(query: Partial<SupplierListQuery>) {
  return useQuery({
    queryKey: supplierKeys.list(query),
    queryFn: () => api.get(`/suppliers${toQuery(query)}`, SupplierList),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => api.post('/suppliers', input, SupplierDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) => api.patch(`/suppliers/${id}`, input, SupplierDto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

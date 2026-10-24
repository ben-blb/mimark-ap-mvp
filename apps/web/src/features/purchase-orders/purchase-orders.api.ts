import {
  type CreatePurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderList,
  type PurchaseOrderListQuery,
  type ReceiptInput,
  type UpdatePurchaseOrderInput,
} from '@mimark/contracts/purchase-orders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from '../../lib/api-client';

/** Query keys y llamadas de la feature en un solo archivo. Los componentes no hacen fetch. */
export const purchaseOrderKeys = {
  all: ['purchase-orders'] as const,
  list: (query: Partial<PurchaseOrderListQuery>) => ['purchase-orders', 'list', query] as const,
};

export function usePurchaseOrders(query: Partial<PurchaseOrderListQuery>) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(query),
    queryFn: () => api.get(`/purchase-orders${toQuery(query)}`, PurchaseOrderList),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      api.post('/purchase-orders', input, PurchaseOrderDto),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdatePurchaseOrderInput) =>
      api.patch(`/purchase-orders/${id}`, input, PurchaseOrderDto),
    onSuccess: invalidate,
  });
}

export function useConfirmReceipt(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ReceiptInput) =>
      api.post(`/purchase-orders/${id}/receipt`, input, PurchaseOrderDto),
    onSuccess: invalidate,
  });
}

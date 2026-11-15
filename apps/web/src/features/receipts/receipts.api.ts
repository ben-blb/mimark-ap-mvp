import { Id } from '@mimark/contracts/common';
import type { ReceiptInput } from '@mimark/contracts/purchase-orders';
import { type ReceiptListQuery, ReceiptOrderList } from '@mimark/contracts/receipts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, toQuery } from '../../lib/api-client';
import { purchaseOrderKeys } from '../purchase-orders/purchase-orders.api';

/** Recepciones sin precios (spec 017). Los componentes no hacen fetch. */
export const receiptKeys = {
  all: ['receipts'] as const,
  list: (query: Partial<ReceiptListQuery>) => ['receipts', 'list', query] as const,
};

export function useReceipts(query: Partial<ReceiptListQuery>) {
  return useQuery({
    queryKey: receiptKeys.list(query),
    queryFn: () => api.get(`/receipts${toQuery(query)}`, ReceiptOrderList),
  });
}

/** Confirma la recepción. De la respuesta solo se lee el id: Almacén no usa precios, aunque la API los devuelva. */
export function useConfirmReceipt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiptInput) =>
      api.post(`/purchase-orders/${id}/receipt`, input, z.object({ id: Id })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: receiptKeys.all }),
        queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all }),
      ]),
  });
}

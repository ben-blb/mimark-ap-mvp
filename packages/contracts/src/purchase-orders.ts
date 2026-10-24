import { z } from 'zod';
import { Currency, Id, LocalDate, Money, listOf } from './common.js';

export const PoNumber = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Escribe el folio')
  .max(30)
  .regex(/^[A-Z0-9][A-Z0-9/-]*$/, 'Folio inválido: letras, números y guiones, p. ej. OC-1001');
export const PositiveMoney = Money.refine((v) => Number(v) > 0, 'El total debe ser mayor a 0');

export const PurchaseOrderDto = z.object({
  id: Id,
  number: z.string(),
  supplier: z.object({ id: Id, name: z.string(), taxId: z.string(), creditDays: z.number().int() }),
  issuedOn: LocalDate,
  total: Money,
  currency: Currency,
  parlevelRef: z.string().nullable(),
  status: z.enum(['open', 'cancelled']),
  receiptStatus: z.enum(['pending', 'received']),
  receivedOn: LocalDate.nullable(),
  receivedBy: z.string().nullable(),
  receiptNotes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PurchaseOrderDto = z.infer<typeof PurchaseOrderDto>;

export const PurchaseOrderList = listOf(PurchaseOrderDto);
export type PurchaseOrderList = z.infer<typeof PurchaseOrderList>;

export const CreatePurchaseOrderInput = z.object({
  number: PoNumber,
  supplierId: Id,
  issuedOn: LocalDate,
  total: PositiveMoney,
  currency: Currency,
  parlevelRef: z.string().trim().max(60).optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInput>;

export const UpdatePurchaseOrderInput = CreatePurchaseOrderInput.omit({
  number: true,
  supplierId: true,
})
  .extend({ status: z.enum(['open', 'cancelled']) })
  .partial();
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderInput>;

export const ReceiptInput = z.object({
  receivedOn: LocalDate,
  notes: z.string().trim().max(500).optional(),
});
export type ReceiptInput = z.infer<typeof ReceiptInput>;

export const PurchaseOrderListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  supplierId: Id.optional(),
  receipt: z.enum(['pending', 'received']).optional(),
  status: z.enum(['open', 'cancelled', 'all']).default('open'),
});
export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuery>;

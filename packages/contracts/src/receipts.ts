import { z } from 'zod';
import { Id, LocalDate, listOf } from './common.js';

/**
 * Recepciones sin precios (spec 017): lo que Almacén necesita para recibir una orden. Esquemas propios, no
 * `PurchaseOrderDto.omit`, para que un campo nuevo de la OC (precio, total) no se filtre aquí.
 */
export const ReceiptLineDto = z.object({
  id: Id,
  position: z.number().int(),
  sku: z.string().nullable(),
  description: z.string(),
  quantity: z.string(),
  unit: z.string(),
});
export type ReceiptLineDto = z.infer<typeof ReceiptLineDto>;

export const ReceiptOrderDto = z.object({
  id: Id,
  number: z.string(),
  supplierName: z.string(),
  issuedOn: LocalDate,
  receiptStatus: z.enum(['pending', 'received']),
  receivedOn: LocalDate.nullable(),
  receivedBy: z.string().nullable(),
  receiptNotes: z.string().nullable(),
  lines: z.array(ReceiptLineDto),
});
export type ReceiptOrderDto = z.infer<typeof ReceiptOrderDto>;

export const ReceiptOrderList = listOf(ReceiptOrderDto);
export type ReceiptOrderList = z.infer<typeof ReceiptOrderList>;

export const ReceiptListQuery = z.object({
  status: z.enum(['pending', 'received']).default('pending'),
  search: z.string().trim().max(100).optional(),
});
export type ReceiptListQuery = z.infer<typeof ReceiptListQuery>;

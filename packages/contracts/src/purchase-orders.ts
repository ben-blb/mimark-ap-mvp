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

/** Cantidad como texto: > 0, hasta 3 decimales. */
export const Quantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Cantidad inválida: usa números con hasta 3 decimales')
  .refine((v) => Number(v) > 0, 'La cantidad debe ser mayor a 0');
/** Precio unitario como texto: ≥ 0, hasta 4 decimales. */
export const UnitPrice = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'Precio inválido: usa números con hasta 4 decimales');

export const MAX_PO_LINES = 200;

export const PoLineInput = z.object({
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().min(1, 'Escribe la descripción').max(200),
  quantity: Quantity,
  unit: z.string().trim().min(1, 'Escribe la unidad').max(20),
  unitPrice: UnitPrice,
});
export type PoLineInput = z.infer<typeof PoLineInput>;

export const PoLineDto = z.object({
  id: Id,
  position: z.number().int(),
  sku: z.string().nullable(),
  description: z.string(),
  quantity: z.string(),
  unit: z.string(),
  unitPrice: z.string(),
  amount: Money,
});
export type PoLineDto = z.infer<typeof PoLineDto>;

const PoLines = z
  .array(PoLineInput)
  .min(1, 'Agrega al menos una partida')
  .max(MAX_PO_LINES, `Máximo ${MAX_PO_LINES} partidas`);

export const PurchaseOrderDto = z.object({
  id: Id,
  number: z.string(),
  supplier: z.object({ id: Id, name: z.string(), taxId: z.string(), creditDays: z.number().int() }),
  issuedOn: LocalDate,
  total: Money,
  /** total − suma de partidas (impuestos implícitos). Nulo si la OC no tiene partidas. */
  taxes: Money.nullable(),
  currency: Currency,
  parlevelRef: z.string().nullable(),
  lines: z.array(PoLineDto),
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
  lines: PoLines,
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
  /** Checklist: ids de todas las partidas recibidas. Vacío solo en OC sin partidas. */
  checkedLineIds: z.array(Id).max(MAX_PO_LINES).default([]),
});
export type ReceiptInput = z.infer<typeof ReceiptInput>;

export const PurchaseOrderListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  supplierId: Id.optional(),
  receipt: z.enum(['pending', 'received']).optional(),
  status: z.enum(['open', 'cancelled', 'all']).default('open'),
});
export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuery>;

/** Aviso del borrador: no bloquea, dice a qué campo o partida se refiere ('lines.2.quantity'). */
export const DraftWarning = z.object({ field: z.string(), message: z.string() });
export type DraftWarning = z.infer<typeof DraftWarning>;

/** Lo que la IA leyó del PDF, ya normalizado. Texto y nulos: la persona lo completa al verificar. */
export const PoLineDraft = z.object({
  sku: z.string().nullable(),
  description: z.string().nullable(),
  quantity: z.string().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.string().nullable(),
  /** Importe que trae el PDF; solo sirve para avisar si no cuadra. */
  statedAmount: Money.nullable(),
  /** Depósito de envase (columna «Deposit» de ParLevel). No se guarda: solo cuadra y avisa (spec 015). */
  deposit: Money.nullable(),
  /** Cajas recibidas que ya trae el PDF; la recepción real es el checklist. */
  receivedQuantity: z.string().nullable(),
});
export type PoLineDraft = z.infer<typeof PoLineDraft>;

export const PurchaseOrderDraft = z.object({
  number: z.string().nullable(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  /** Proveedor activo que coincide por RFC, alias de ParLevel o nombre (`supplierMatch`). */
  supplier: z
    .object({
      id: Id,
      name: z.string(),
      taxId: z.string(),
      creditDays: z.number().int(),
      currency: Currency,
    })
    .nullable(),
  supplierMatch: z.enum(['taxId', 'alias', 'name']).nullable(),
  /** Sin coincidencia: lo que dice el PDF del proveedor, para registrarlo. */
  supplierSuggestion: z.object({ name: z.string(), city: z.string().nullable() }).nullable(),
  issuedOn: LocalDate.nullable(),
  currency: Currency.nullable(),
  parlevelRef: z.string().nullable(),
  lines: z.array(PoLineDraft),
  subtotal: Money.nullable(),
  taxes: Money.nullable(),
  total: Money.nullable(),
  uncertainFields: z.array(z.string()),
  warnings: z.array(DraftWarning),
});
export type PurchaseOrderDraft = z.infer<typeof PurchaseOrderDraft>;

/**
 * Ayuda para capturar el total cuando el PDF solo trae subtotal (spec 015): round(subtotal × 1.16, 2), mitad
 * hacia arriba y en centavos enteros. Es una sugerencia; el total lo decide la persona.
 */
export function totalWithVat(subtotal: Money): Money {
  const [whole = '0', frac = ''] = subtotal.trim().split('.');
  const cents = BigInt(whole + frac.padEnd(2, '0'));
  const withVat = (cents * 116n + 50n) / 100n;
  return `${withVat / 100n}.${String(withVat % 100n).padStart(2, '0')}`;
}

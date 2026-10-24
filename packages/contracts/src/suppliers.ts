import { z } from 'zod';
import { Currency, Id, TaxId, intField, listOf } from './common.js';

export const SupplierDto = z.object({
  id: Id,
  name: z.string(),
  taxId: z.string(),
  /** Días de crédito; 0 = contado. */
  creditDays: z.number().int(),
  currency: Currency,
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SupplierDto = z.infer<typeof SupplierDto>;

export const SupplierList = listOf(SupplierDto);
export type SupplierList = z.infer<typeof SupplierList>;

export const CreateSupplierInput = z.object({
  name: z.string().trim().min(2, 'Escribe la razón social').max(200, 'Máximo 200 caracteres'),
  taxId: TaxId,
  creditDays: intField({ min: 0, max: 365, required: 'Escribe los días de crédito (0 = contado)' }),
  currency: Currency,
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierInput>;

export const UpdateSupplierInput = CreateSupplierInput.extend({ active: z.boolean() }).partial();
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierInput>;

export const SupplierListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type SupplierListQuery = z.infer<typeof SupplierListQuery>;

import { z } from 'zod';
import { CURRENCIES } from './common.js';

/** Lo único que el modelo de IA puede devolver: datos del documento, nunca decisiones. */
export const DOC_TYPES = ['factura', 'ticket', 'remision', 'otro'] as const;
export const EXTRACTED_FIELDS = [
  'supplierName',
  'supplierTaxId',
  'invoiceNumber',
  'issueDate',
  'purchaseOrderNumber',
  'subtotal',
  'taxes',
  'total',
  'currency',
  'taxUuid',
] as const;
export const ExtractedField = z.enum(EXTRACTED_FIELDS);
export type ExtractedField = z.infer<typeof ExtractedField>;

// Sin min/max/regex a propósito: no todos los proveedores de IA los aceptan en su modo estructurado.
// Los formatos los revisa normalizeExtraction.
export const ExtractionSchema = z.object({
  documentType: z.enum(DOC_TYPES).nullable().describe('factura (CFDI), ticket, remision u otro'),
  isAccountsPayableDocument: z.boolean().describe('false si no es una compra a un proveedor'),
  supplierName: z.string().nullable().describe('Razón social del emisor'),
  supplierTaxId: z.string().nullable().describe('RFC del emisor, no del receptor'),
  invoiceNumber: z
    .string()
    .nullable()
    .describe('Serie y folio de la factura o número del documento'),
  issueDate: z.string().nullable().describe('Fecha de emisión AAAA-MM-DD'),
  purchaseOrderNumber: z
    .string()
    .nullable()
    .describe('Número de orden de compra solo si aparece escrito'),
  subtotal: z.number().nullable(),
  taxes: z.number().nullable().describe('Total de impuestos trasladados'),
  total: z.number().nullable().describe('Total con impuestos'),
  currency: z.enum(CURRENCIES).nullable(),
  taxUuid: z.string().nullable().describe('Folio fiscal (UUID) del CFDI'),
  missingFields: z.array(ExtractedField),
  uncertainFields: z.array(ExtractedField),
  sourceEvidence: z.array(
    z.object({
      field: ExtractedField,
      text: z.string().describe('Fragmento literal, máximo 120 caracteres'),
      page: z.number().int().nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

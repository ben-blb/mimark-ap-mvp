import { z } from 'zod';
import { Currency, Id, LocalDate, Money, listOf } from './common.js';
import { DOC_TYPES, ExtractedField } from './extraction.js';
import { PoNumber } from './purchase-orders.js';

export const PAYABLE_STATUSES = [
  'uploaded',
  'processing',
  'requires_review',
  'pending_confirmation',
  'confirmed',
  'scheduled',
  'paid',
  'out_of_scope',
  'failed',
  'discarded',
] as const;
export const PayableStatus = z.enum(PAYABLE_STATUSES);
export type PayableStatus = z.infer<typeof PayableStatus>;

export const REVIEW_REASON_CODES = [
  'NOT_AP_DOCUMENT',
  'MISSING_FIELD',
  'UNCERTAIN_FIELD',
  'PO_NOT_FOUND',
  'PO_MISMATCH',
  'PO_CANCELLED',
  'PO_ALREADY_INVOICED',
  'TAX_ID_MISMATCH',
  'CURRENCY_MISMATCH',
  'TOTAL_MISMATCH',
  'RECEIPT_NOT_CONFIRMED',
  'DUPLICATE',
] as const;
export const PAYABLE_ACTIONS = [
  'retry',
  'correct',
  'confirm',
  'schedule',
  'pay',
  'documents',
  'discard',
] as const;

export const ReviewReason = z.object({
  code: z.enum(REVIEW_REASON_CODES),
  field: ExtractedField.optional(),
});
export type ReviewReason = z.infer<typeof ReviewReason>;

export const PayableFields = z.object({
  docType: z.enum(DOC_TYPES).nullable(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  issueDate: LocalDate.nullable(),
  poNumber: z.string().nullable(),
  subtotal: Money.nullable(),
  taxes: Money.nullable(),
  total: Money.nullable(),
  currency: Currency.nullable(),
  taxUuid: z.string().nullable(),
});
export type PayableFields = z.infer<typeof PayableFields>;

export const PayableDto = z.object({
  id: Id,
  status: PayableStatus,
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  file: z.object({ name: z.string(), mimeType: z.string(), size: z.number().int() }),
  invoiceReceivedOn: LocalDate,
  selectedPoNumber: z.string().nullable(),
  isApDocument: z.boolean().nullable(),
  fields: PayableFields,
  uncertainFields: z.array(ExtractedField),
  reviewReasons: z.array(ReviewReason),
  evidence: z.array(
    z.object({ field: ExtractedField, text: z.string(), page: z.number().int().nullable() }),
  ),
  failureCode: z.string().nullable(),
  purchaseOrder: z
    .object({
      id: Id,
      number: z.string(),
      total: Money,
      currency: Currency,
      receiptStatus: z.enum(['pending', 'received']),
    })
    .nullable(),
  supplier: z
    .object({ id: Id, name: z.string(), taxId: z.string(), creditDays: z.number().int() })
    .nullable(),
  extraction: z.object({ model: z.string(), promptVersion: z.string(), ms: z.number() }).nullable(),
  schedule: z
    .object({
      dueOn: LocalDate,
      suggestedPayOn: LocalDate,
      scheduledPayOn: LocalDate.nullable(),
      urgent: z.boolean(),
      /** dueOn < hoy y todavía no se paga. */
      overdue: z.boolean(),
    })
    .nullable(),
  payment: z.object({ paidOn: LocalDate, amount: Money, reference: z.string() }).nullable(),
  documents: z
    .object({
      invoice: z.enum(['pending', 'received']).nullable(),
      complement: z.enum(['pending', 'received']).nullable(),
    })
    .nullable(),
  discardReason: z.string().nullable(),
  allowedActions: z.array(z.enum(PAYABLE_ACTIONS)),
});
export type PayableDto = z.infer<typeof PayableDto>;

export const PayableSummaryDto = PayableDto.pick({
  id: true,
  status: true,
  createdAt: true,
  createdBy: true,
  reviewReasons: true,
}).extend({
  fileName: z.string(),
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  poNumber: z.string().nullable(),
  total: Money.nullable(),
  currency: Currency.nullable(),
});
export type PayableSummaryDto = z.infer<typeof PayableSummaryDto>;

export const PayableList = listOf(PayableSummaryDto);
export type PayableList = z.infer<typeof PayableList>;

export const PayableListQuery = z.object({
  status: PayableStatus.optional(),
  search: z.string().trim().max(100).optional(),
  createdBy: z.string().trim().max(60).optional(),
});
export type PayableListQuery = z.infer<typeof PayableListQuery>;

/** Campos de texto del multipart; el archivo va aparte. */
export const UploadPayableInput = z.object({
  purchaseOrderNumber: PoNumber.optional(),
  invoiceReceivedOn: LocalDate.optional(),
});
export type UploadPayableInput = z.infer<typeof UploadPayableInput>;

export const PayableHistory = listOf(
  z.object({
    at: z.iso.datetime(),
    actor: z.string(),
    action: z.string(),
    fromStatus: z.string().nullable(),
    toStatus: z.string().nullable(),
    data: z.unknown().nullable(),
  }),
);
export type PayableHistory = z.infer<typeof PayableHistory>;

/** Corrección humana de los campos vigentes. Solo viajan los campos que cambian. */
export const CorrectFieldsInput = PayableFields.partial().extend({
  isApDocument: z.boolean().optional(),
});
export type CorrectFieldsInput = z.infer<typeof CorrectFieldsInput>;

export const ScheduleInput = z.object({ payOn: LocalDate.optional() });
export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const PaymentInput = z.object({
  paidOn: LocalDate,
  amount: Money,
  reference: z.string().trim().min(3, 'Escribe la referencia del pago').max(60),
});
export type PaymentInput = z.infer<typeof PaymentInput>;

export const DocumentsInput = z.object({
  invoiceDocStatus: z.enum(['pending', 'received']).optional(),
  complementStatus: z.enum(['pending', 'received']).optional(),
});
export type DocumentsInput = z.infer<typeof DocumentsInput>;

export const DiscardInput = z.object({
  reason: z.string().trim().min(5, 'Explica el motivo').max(300),
});
export type DiscardInput = z.infer<typeof DiscardInput>;

/** Tipos y tamaño de archivo aceptados; los usan la API y el diálogo de carga con el mismo mensaje. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

/** Mensajes de rechazo de archivo: la API y el diálogo de carga dicen exactamente lo mismo. */
export const FILE_REJECTION_MESSAGES = {
  FILE_TOO_LARGE: 'El archivo pesa más de 4 MB. Comprímelo o súbelo en otra resolución.',
  FILE_TYPE_NOT_ALLOWED: 'Solo se aceptan archivos PDF, PNG o JPG.',
} as const;

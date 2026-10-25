import { Currency, LocalDate, TaxId } from '@mimark/contracts/common';
import {
  EXTRACTED_FIELDS,
  type DOC_TYPES,
  type Extraction,
  type ExtractedField,
} from '@mimark/contracts/extraction';
import { ReviewReason, type PayableStatus } from '@mimark/contracts/payables';
import { PoNumber } from '@mimark/contracts/purchase-orders';
import { numberToCents } from '../../common/money.js';

/** Reglas puras de expedientes: normalizar lo que leyó la IA y decidir a dónde va. */

export interface Facts {
  isApDocument: boolean;
  docType: (typeof DOC_TYPES)[number] | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  issueDate: LocalDate | null;
  poNumber: string | null;
  subtotalCents: number | null;
  taxesCents: number | null;
  totalCents: number | null;
  currency: Currency | null;
  taxUuid: string | null;
  uncertainFields: ExtractedField[];
}

export interface PayableContext {
  selectedPoNumber: string | null;
  purchaseOrder: {
    number: string;
    status: 'open' | 'cancelled';
    totalCents: number;
    currency: Currency;
    receiptStatus: 'pending' | 'received';
    supplierTaxId: string;
  } | null;
  /** Id de otro expediente vivo con el mismo UUID o RFC + folio. */
  duplicateOf: string | null;
  /** Id de otro expediente vivo ligado a la misma OC. */
  otherPayableForPo: string | null;
}

const UUID_PATTERN = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const RETRY_AFTER_MS = 5 * 60_000;

const clean = (value: string | null): string | null => value?.trim() || null;
const compact = (value: string | null): string | null =>
  clean(value)?.replace(/\s+/g, '').toUpperCase() || null;

export function normalizeExtraction(raw: Extraction): Facts {
  if (!raw.isAccountsPayableDocument) {
    return {
      isApDocument: false,
      docType: null,
      supplierName: null,
      supplierTaxId: null,
      invoiceNumber: null,
      issueDate: null,
      poNumber: null,
      subtotalCents: null,
      taxesCents: null,
      totalCents: null,
      currency: null,
      taxUuid: null,
      uncertainFields: [],
    };
  }

  const uncertain = new Set<ExtractedField>(raw.uncertainFields);
  const flag = (field: ExtractedField, invalid: boolean) => {
    if (invalid) uncertain.add(field);
  };

  const supplierTaxId = compact(raw.supplierTaxId)?.replace(/-/g, '') ?? null;
  flag('supplierTaxId', supplierTaxId !== null && !TaxId.safeParse(supplierTaxId).success);

  const poNumber = compact(raw.purchaseOrderNumber);
  flag('purchaseOrderNumber', poNumber !== null && !PoNumber.safeParse(poNumber).success);

  const taxUuid = compact(raw.taxUuid);
  flag('taxUuid', taxUuid !== null && !UUID_PATTERN.test(taxUuid));

  const issueDate = clean(raw.issueDate);
  const validDate = issueDate !== null && LocalDate.safeParse(issueDate).success;
  flag('issueDate', issueDate !== null && !validDate);

  const cents = (field: ExtractedField, value: number | null): number | null => {
    if (value === null) return null;
    const result = Number.isFinite(value) && value >= 0 ? numberToCents(value) : null;
    flag(field, result === null);
    return result;
  };

  return {
    isApDocument: true,
    docType: raw.documentType,
    supplierName: clean(raw.supplierName),
    supplierTaxId,
    invoiceNumber: compact(raw.invoiceNumber),
    issueDate: validDate ? issueDate : null,
    poNumber,
    subtotalCents: cents('subtotal', raw.subtotal),
    taxesCents: cents('taxes', raw.taxes),
    totalCents: cents('total', raw.total),
    currency: raw.currency,
    taxUuid,
    uncertainFields: EXTRACTED_FIELDS.filter((field) => uncertain.has(field)),
  };
}

export function evaluatePayable(
  facts: Facts,
  ctx: PayableContext,
): { status: 'pending_confirmation' | 'requires_review' | 'out_of_scope'; reasons: string[] } {
  if (!facts.isApDocument) return { status: 'out_of_scope', reasons: ['NOT_AP_DOCUMENT'] };

  const reasons: string[] = [];

  const required: [ExtractedField, boolean][] = [
    ['supplierTaxId', facts.supplierTaxId === null],
    ['invoiceNumber', facts.invoiceNumber === null],
    ['issueDate', facts.issueDate === null],
    ['total', facts.totalCents === null],
    ['currency', facts.currency === null],
    ['purchaseOrderNumber', facts.poNumber === null && ctx.selectedPoNumber === null],
    ['taxUuid', facts.docType === 'factura' && facts.taxUuid === null],
  ];
  const missing = new Set(required.filter(([, isMissing]) => isMissing).map(([field]) => field));
  for (const field of missing) reasons.push(`MISSING_FIELD:${field}`);
  for (const field of facts.uncertainFields) {
    if (!missing.has(field)) reasons.push(`UNCERTAIN_FIELD:${field}`);
  }

  const po = ctx.purchaseOrder;
  if (!po) {
    if (facts.poNumber !== null || ctx.selectedPoNumber !== null) reasons.push('PO_NOT_FOUND');
  } else {
    if (
      ctx.selectedPoNumber !== null &&
      facts.poNumber !== null &&
      ctx.selectedPoNumber !== facts.poNumber
    ) {
      reasons.push('PO_MISMATCH');
    }
    if (po.status === 'cancelled') reasons.push('PO_CANCELLED');
    if (facts.supplierTaxId !== null && facts.supplierTaxId !== po.supplierTaxId) {
      reasons.push('TAX_ID_MISMATCH');
    }
    if (facts.currency !== null && facts.currency !== po.currency) {
      reasons.push('CURRENCY_MISMATCH');
    }
    if (facts.totalCents !== null && facts.totalCents !== po.totalCents) {
      reasons.push('TOTAL_MISMATCH');
    }
    if (po.receiptStatus !== 'received') reasons.push('RECEIPT_NOT_CONFIRMED');
    if (ctx.otherPayableForPo !== null) reasons.push('PO_ALREADY_INVOICED');
  }
  if (ctx.duplicateOf !== null) reasons.push('DUPLICATE');

  return { status: reasons.length === 0 ? 'pending_confirmation' : 'requires_review', reasons };
}

/** `failed`, o `processing` sin cambios por más de 5 minutos (la función se cayó a la mitad). */
export function canRetry(status: PayableStatus, updatedAt: Date, now: Date): boolean {
  return (
    status === 'failed' ||
    (status === 'processing' && now.getTime() - updatedAt.getTime() > RETRY_AFTER_MS)
  );
}

/** La spec 005 completa la tabla de acciones. */
export function allowedActions(status: PayableStatus, updatedAt: Date, now: Date): 'retry'[] {
  return canRetry(status, updatedAt, now) ? ['retry'] : [];
}

/** "MISSING_FIELD:total" → { code, field }. Las razones se guardan como texto. */
export function parseReason(reason: string): ReviewReason {
  const [code, field] = reason.split(':');
  return ReviewReason.parse(field ? { code, field } : { code });
}

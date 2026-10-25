import { ExtractionSchema } from '@mimark/contracts/extraction';
import type { PayableDto, PayableSummaryDto } from '@mimark/contracts/payables';
import { z } from 'zod';
import { centsToMoney } from '../../common/money.js';
import { fromDbDate } from '../../common/dates.js';
import type { ExtractionResult } from '../../integrations/extraction.client.js';
import type { PayableEvaluation, PayableRow } from './payables.repository.js';
import { allowedActions, type Facts, parseReason } from './payables.rules.js';

/** Lo que se guarda de la llamada a la IA, tal cual y sin cambios. */
const StoredExtraction = z.object({
  data: ExtractionSchema,
  model: z.string(),
  promptVersion: z.string(),
  ms: z.number(),
});

export function toPayableDto(row: PayableRow): PayableDto {
  const stored = StoredExtraction.safeParse(row.extraction);
  const extraction = stored.success ? stored.data : null;
  const money = (value: { toFixed(digits: number): string } | null) => value?.toFixed(2) ?? null;
  return {
    id: row.id,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    file: { name: row.fileName, mimeType: row.mimeType, size: row.fileSize },
    invoiceReceivedOn: fromDbDate(row.invoiceReceivedOn),
    selectedPoNumber: row.selectedPoNumber,
    isApDocument: row.isApDocument,
    fields: {
      docType: row.docType,
      supplierName: row.supplierName,
      supplierTaxId: row.supplierTaxId,
      invoiceNumber: row.invoiceNumber,
      issueDate: row.issueDate ? fromDbDate(row.issueDate) : null,
      poNumber: row.poNumber,
      subtotal: money(row.subtotal),
      taxes: money(row.taxes),
      total: money(row.total),
      currency: row.currency,
      taxUuid: row.taxUuid,
    },
    uncertainFields: z
      .array(ExtractionSchema.shape.uncertainFields.element)
      .parse(row.uncertainFields),
    reviewReasons: row.reviewReasons.map(parseReason),
    evidence: row.isApDocument === false ? [] : (extraction?.data.sourceEvidence ?? []),
    failureCode: row.failureCode,
    purchaseOrder: row.purchaseOrder && {
      id: row.purchaseOrder.id,
      number: row.purchaseOrder.number,
      total: row.purchaseOrder.total.toFixed(2),
      currency: row.purchaseOrder.currency,
      receiptStatus: row.purchaseOrder.receiptStatus,
    },
    supplier: row.supplier && {
      id: row.supplier.id,
      name: row.supplier.name,
      taxId: row.supplier.taxId,
      creditDays: row.supplier.creditDays,
    },
    extraction: extraction && {
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      ms: extraction.ms,
    },
    allowedActions: allowedActions(row.status, row.updatedAt, new Date()),
  };
}

export function toPayableSummary(row: PayableRow): PayableSummaryDto {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    reviewReasons: row.reviewReasons.map(parseReason),
    fileName: row.fileName,
    supplierName: row.supplierName,
    invoiceNumber: row.invoiceNumber,
    poNumber: row.poNumber,
    total: row.total?.toFixed(2) ?? null,
    currency: row.currency,
  };
}

/** Resultado de las reglas, en la forma de la tabla (importes en centavos → texto con 2 decimales). */
export function toEvaluation(input: {
  facts: Facts;
  status: PayableEvaluation['status'];
  reasons: string[];
  result: ExtractionResult;
  po: { id: string } | null;
  supplier: { id: string } | null;
}): PayableEvaluation {
  const { facts, result } = input;
  const money = (cents: number | null) => (cents === null ? null : centsToMoney(cents));
  return {
    status: input.status,
    extraction: {
      data: result.data,
      model: result.model,
      promptVersion: result.promptVersion,
      ms: result.ms,
    },
    isApDocument: facts.isApDocument,
    docType: facts.docType,
    supplierName: facts.supplierName,
    supplierTaxId: facts.supplierTaxId,
    invoiceNumber: facts.invoiceNumber,
    issueDate: facts.issueDate,
    poNumber: facts.poNumber,
    subtotal: money(facts.subtotalCents),
    taxes: money(facts.taxesCents),
    total: money(facts.totalCents),
    currency: facts.currency,
    taxUuid: facts.taxUuid,
    uncertainFields: facts.uncertainFields,
    reviewReasons: input.reasons,
    purchaseOrderId: input.po?.id ?? null,
    supplierId: input.supplier?.id ?? null,
  };
}

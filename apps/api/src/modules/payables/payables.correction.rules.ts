import { EXTRACTED_FIELDS, type ExtractedField } from '@mimark/contracts/extraction';
import type { CorrectFieldsInput } from '@mimark/contracts/payables';
import { centsToMoney, moneyToCents } from '../../common/money.js';
import { clean, compact, type Facts } from './payables.rules.js';

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

const money = (value: string | null): number | null =>
  value === null ? null : moneyToCents(value);
const showMoney = (cents: number | null) => (cents === null ? null : centsToMoney(cents));
const noHyphens = (value: string | null) => compact(value)?.replace(/-/g, '') ?? null;

/**
 * Aplica la corrección de una persona sobre los campos vigentes: normaliza como `normalizeExtraction`,
 * saca de `uncertainFields` todo campo enviado (una persona ya lo vio) y devuelve el diff para la auditoría.
 * No muta `current`. Después hay que volver a correr `evaluatePayable`.
 */
export function applyCorrection(
  current: Facts,
  input: CorrectFieldsInput,
): { facts: Facts; changes: FieldChanges } {
  const facts: Facts = { ...current };
  const uncertain = new Set<ExtractedField>(current.uncertainFields);
  const changes: FieldChanges = {};

  function apply<K extends keyof Facts>(
    inputKey: string,
    fact: K,
    field: ExtractedField | null,
    value: Facts[K],
    show: (v: Facts[K]) => unknown = (v) => v,
  ): void {
    if (field) uncertain.delete(field);
    if (value === current[fact]) return;
    facts[fact] = value;
    changes[inputKey] = { from: show(current[fact]), to: show(value) };
  }

  if (input.isApDocument !== undefined) {
    apply('isApDocument', 'isApDocument', null, input.isApDocument);
  }
  if (input.docType !== undefined) apply('docType', 'docType', null, input.docType);
  if (input.supplierName !== undefined) {
    apply('supplierName', 'supplierName', 'supplierName', clean(input.supplierName));
  }
  if (input.supplierTaxId !== undefined) {
    apply('supplierTaxId', 'supplierTaxId', 'supplierTaxId', noHyphens(input.supplierTaxId));
  }
  if (input.invoiceNumber !== undefined) {
    apply('invoiceNumber', 'invoiceNumber', 'invoiceNumber', compact(input.invoiceNumber));
  }
  if (input.issueDate !== undefined) apply('issueDate', 'issueDate', 'issueDate', input.issueDate);
  if (input.poNumber !== undefined) {
    apply('poNumber', 'poNumber', 'purchaseOrderNumber', compact(input.poNumber));
  }
  if (input.subtotal !== undefined) {
    apply('subtotal', 'subtotalCents', 'subtotal', money(input.subtotal), showMoney);
  }
  if (input.taxes !== undefined)
    apply('taxes', 'taxesCents', 'taxes', money(input.taxes), showMoney);
  if (input.total !== undefined)
    apply('total', 'totalCents', 'total', money(input.total), showMoney);
  if (input.currency !== undefined) apply('currency', 'currency', 'currency', input.currency);
  if (input.taxUuid !== undefined) apply('taxUuid', 'taxUuid', 'taxUuid', compact(input.taxUuid));

  facts.uncertainFields = EXTRACTED_FIELDS.filter((field) => uncertain.has(field));
  return { facts, changes };
}

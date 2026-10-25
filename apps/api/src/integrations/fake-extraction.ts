import { createHash } from 'node:crypto';
import type { Extraction } from '@mimark/contracts/extraction';

/** Modo `fake` (solo desarrollo y demo local): responde según el nombre y un hash del archivo, sin IA. */
export function fakeExtraction(bytes: Buffer, fileName: string): Extraction {
  const name = fileName.toLowerCase();
  if (name.includes('error-ia')) throw new Error('Falla simulada del proveedor de IA');

  const empty: Extraction = {
    documentType: null,
    isAccountsPayableDocument: false,
    supplierName: null,
    supplierTaxId: null,
    invoiceNumber: null,
    issueDate: null,
    purchaseOrderNumber: null,
    subtotal: null,
    taxes: null,
    total: null,
    currency: null,
    taxUuid: null,
    missingFields: [],
    uncertainFields: [],
    sourceEvidence: [],
  };
  if (name.includes('nomina')) return empty;

  // El mismo archivo dos veces es duplicado; archivos distintos no.
  const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const taxUuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  const invoiceNumber = `F-${hash.slice(0, 6)}`;

  const base: Extraction = {
    ...empty,
    documentType: 'factura',
    isAccountsPayableDocument: true,
    supplierName: 'Distribuidora Alimentos del Norte SA de CV',
    supplierTaxId: 'DAN010203AB1',
    invoiceNumber,
    issueDate: '2026-10-06',
    purchaseOrderNumber: 'OC-1001',
    subtotal: 10000,
    taxes: 1600,
    total: 11600,
    currency: 'MXN',
    taxUuid,
  };
  let data = base;
  if (name.includes('sin-oc')) {
    data = {
      ...base,
      supplierName: 'Bebidas Frías de Monterrey SA de CV',
      supplierTaxId: 'BFM980512KL3',
      purchaseOrderNumber: null,
      subtotal: 7200,
      taxes: 1152,
      total: 8352,
      missingFields: ['purchaseOrderNumber'],
    };
  } else if (name.includes('total-distinto')) {
    data = {
      ...base,
      supplierName: 'Bebidas Frías de Monterrey SA de CV',
      supplierTaxId: 'BFM980512KL3',
      purchaseOrderNumber: 'OC-1002',
      subtotal: 7355.17,
      taxes: 1176.83,
      total: 8532,
    };
  }

  const evidenceFields = (
    ['supplierTaxId', 'invoiceNumber', 'purchaseOrderNumber', 'total'] as const
  ).filter((field) => data[field] !== null);
  return {
    ...data,
    sourceEvidence: evidenceFields.map((field) => ({
      field,
      text: `${field}: ${String(data[field])}`,
      page: 1,
    })),
  };
}

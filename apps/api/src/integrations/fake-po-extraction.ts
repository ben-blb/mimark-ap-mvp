import type { PoExtraction } from '@mimark/contracts/extraction';

/** Modo `fake` (solo desarrollo y demo local): responde según el nombre del archivo, sin IA. */
export function fakePoExtraction(fileName: string): PoExtraction {
  const name = fileName.toLowerCase();
  if (name.includes('error-ia')) throw new Error('Falla simulada del proveedor de IA');

  const empty: PoExtraction = {
    isPurchaseOrder: false,
    number: null,
    supplierName: null,
    supplierTaxId: null,
    issuedOn: null,
    currency: null,
    parlevelRef: null,
    lines: [],
    subtotal: null,
    taxes: null,
    total: null,
    missingFields: [],
    uncertainFields: [],
  };
  if (name.includes('nomina')) return empty;

  const base: PoExtraction = {
    ...empty,
    isPurchaseOrder: true,
    number: name.includes('folio-repetido') ? 'OC-1001' : 'OC-3001',
    supplierName: 'Café Sierra Madre SC',
    supplierTaxId: 'CSM120304TR5',
    issuedOn: '2026-10-20',
    currency: 'MXN',
    parlevelRef: 'PL-0042',
    lines: [
      {
        sku: 'CAF-001',
        description: 'Café molido 1 kg',
        quantity: 20,
        unit: 'bolsa',
        unitPrice: 100,
        amount: 2000,
      },
      {
        sku: 'CAF-020',
        description: 'Filtros para cafetera',
        quantity: 10,
        unit: 'caja',
        unitPrice: 50,
        amount: 500,
      },
    ],
    subtotal: 2500,
    taxes: 400,
    total: 2900,
  };
  if (name.includes('importe-distinto')) {
    return {
      ...base,
      lines: [{ ...base.lines[0]!, amount: 1900 }, base.lines[1]!],
      uncertainFields: ['lines'],
    };
  }
  return base;
}

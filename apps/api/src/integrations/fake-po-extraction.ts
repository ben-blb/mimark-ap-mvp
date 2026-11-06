import type { PoExtraction } from '@mimark/contracts/extraction';

type Line = PoExtraction['lines'][number];
const line = (l: Omit<Line, 'deposit' | 'receivedQuantity'>): Line => ({
  ...l,
  deposit: null,
  receivedQuantity: null,
});

/** Modo `fake` (solo desarrollo y demo local): responde según el nombre del archivo, sin IA. */
export function fakePoExtraction(fileName: string): PoExtraction {
  const name = fileName.toLowerCase();
  if (name.includes('error-ia')) throw new Error('Falla simulada del proveedor de IA');

  const empty: PoExtraction = {
    isPurchaseOrder: false,
    number: null,
    supplierName: null,
    supplierTaxId: null,
    supplierCity: null,
    buyerName: null,
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
  if (name.includes('parlevel-warehouse')) return parlevelWarehouse(name, empty);

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
      line({
        sku: 'CAF-001',
        description: 'Café molido 1 kg',
        quantity: 20,
        unit: 'bolsa',
        unitPrice: 100,
        amount: 2000,
      }),
      line({
        sku: 'CAF-020',
        description: 'Filtros para cafetera',
        quantity: 10,
        unit: 'caja',
        unitPrice: 50,
        amount: 500,
      }),
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

/**
 * OC con el diseño real de ParLevel Warehouse (spec 015): folio «P…», fecha MM-DD-AAAA, comprador en «From:»,
 * proveedor sin RFC en «To:», cajas, depósito y solo subtotal estimado. Importes del PDF de ejemplo; proveedor y
 * productos inventados.
 */
function parlevelWarehouse(name: string, empty: PoExtraction): PoExtraction {
  const rows: [string, number, number][] = [
    ['Agua natural 1 L', 15, 89.5],
    ['Agua natural garrafa 5 L', 2, 136.5],
    ['Bebida de jamaica light 1 L', 50, 99.5],
    ['Bebida de limón light 1 L', 45, 99.5],
    ['Refresco de manzana 400 ml', 8, 102.5],
    ['Refresco de naranja 400 ml', 2, 102.5],
    ['Refresco cola 600 ml', 75, 149.5],
    ['Refresco cola sin azúcar 600 ml', 40, 149.5],
    ['Bebida isotónica ponche 600 ml', 15, 106],
  ];
  const lines = rows.map(([description, quantity, unitPrice]) => ({
    sku: null,
    description,
    quantity,
    unit: 'caja',
    unitPrice,
    amount: Math.round(quantity * unitPrice * 100) / 100,
    deposit: 0,
    receivedQuantity: 0,
  }));
  if (name.includes('-deposito')) {
    lines[0] = { ...lines[0]!, deposit: 25, amount: lines[0]!.amount + 25, receivedQuantity: 15 };
  }
  return {
    ...empty,
    isPurchaseOrder: true,
    number: 'P3062',
    parlevelRef: 'P3062',
    supplierName: name.includes('-comprador') ? 'SMART KIOSKO' : 'Refrescos del Norte',
    supplierCity: 'Monterrey, Nuevo Leon 64890',
    buyerName: 'SMART KIOSKO',
    issuedOn: '08-05-2026',
    lines,
    subtotal: name.includes('-deposito') ? 30900.5 : 30875.5,
    missingFields: ['supplierTaxId', 'currency', 'taxes', 'total'],
  };
}

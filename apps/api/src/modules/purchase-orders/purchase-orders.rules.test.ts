import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import type { PoExtraction } from '@mimark/contracts/extraction';
import {
  buildDraftWarnings,
  checkIssuedOn,
  checkReceipt,
  checkReceiptLines,
  checkTotalCoversLines,
  impliedTaxes,
  lineAmount,
  linesSubtotal,
  normalizePoExtraction,
  parseParlevelDate,
  pickSupplier,
  type SupplierCandidate,
} from './purchase-orders.rules.js';

const today = '2026-10-20';
const open = { status: 'open', receiptStatus: 'pending', issuedOn: '2026-10-10' } as const;

function errorOf(fn: () => void): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó error');
}

describe('checkIssuedOn', () => {
  it('AC-003-03 acepta hoy y fechas pasadas', () => {
    expect(() => checkIssuedOn(today, today)).not.toThrow();
    expect(() => checkIssuedOn('2026-01-01', today)).not.toThrow();
  });

  it('AC-003-03 rechaza una fecha futura indicando el campo', () => {
    const error = errorOf(() => checkIssuedOn('2026-10-21', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toHaveProperty('issuedOn');
  });
});

describe('checkReceipt', () => {
  it('AC-003-04 acepta una OC abierta y pendiente con fecha entre la OC y hoy', () => {
    expect(() => checkReceipt(open, '2026-10-10', today)).not.toThrow();
    expect(() => checkReceipt(open, today, today)).not.toThrow();
  });

  it('AC-003-05 rechaza una OC cancelada con INVALID_TRANSITION', () => {
    const error = errorOf(() => checkReceipt({ ...open, status: 'cancelled' }, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.message).toBe('La OC está cancelada.');
  });

  it('AC-003-05 rechaza una recepción ya confirmada con INVALID_TRANSITION', () => {
    const error = errorOf(() => checkReceipt({ ...open, receiptStatus: 'received' }, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.message).toBe('La recepción ya fue confirmada.');
  });

  it('AC-018-07 rechaza una recepción ya confirmada con diferencias', () => {
    const po = { ...open, receiptStatus: 'received_with_differences' } as const;
    const error = errorOf(() => checkReceipt(po, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
  });

  it('AC-003-05 la cancelada se evalúa antes que la ya recibida', () => {
    const po = { ...open, status: 'cancelled', receiptStatus: 'received' } as const;
    expect(errorOf(() => checkReceipt(po, today, today)).message).toBe('La OC está cancelada.');
  });

  it('AC-003-05 rechaza una fecha futura con fieldErrors.receivedOn', () => {
    const error = errorOf(() => checkReceipt(open, '2026-10-21', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({
      receivedOn: 'La fecha de recepción no puede ser futura',
    });
  });

  it('AC-003-05 rechaza una fecha anterior a la OC con fieldErrors.receivedOn', () => {
    const error = errorOf(() => checkReceipt(open, '2026-10-09', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({
      receivedOn: 'La recepción no puede ser anterior a la OC',
    });
  });
});

describe('lineAmount y linesSubtotal', () => {
  it.each([
    ['3', '1250.50', '3751.50'],
    ['0.333', '10', '3.33'],
    ['0.5', '0.01', '0.01'], // 0.005 redondea hacia arriba
    ['1.5', '0.0033', '0.00'],
    ['1000', '0.0001', '0.10'],
  ])('AC-014-01 lineAmount(%s, %s) = %s', (q, p, expected) => {
    expect(lineAmount(q, p)).toBe(expected);
  });

  it('AC-014-01 suma los importes ya redondeados de cada partida', () => {
    const lines = [
      { quantity: '0.333', unitPrice: '10' },
      { quantity: '0.333', unitPrice: '10' },
    ];
    expect(linesSubtotal(lines)).toBe('6.66');
  });
});

describe('total contra partidas', () => {
  it('AC-014-03 acepta un total mayor o igual y calcula los impuestos implícitos', () => {
    expect(() => checkTotalCoversLines('1160.00', '1000.00')).not.toThrow();
    expect(() => checkTotalCoversLines('1000.00', '1000.00')).not.toThrow();
    expect(impliedTaxes('1160.00', 2, '1000.00')).toBe('160.00');
    expect(impliedTaxes('1160.00', 0, '0.00')).toBeNull();
  });

  it('AC-014-03 rechaza un total menor que la suma de las partidas', () => {
    const error = errorOf(() => checkTotalCoversLines('900.00', '1000.00'));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toHaveProperty('total');
  });
});

describe('checkReceiptLines', () => {
  const order = [
    { id: 'a', quantity: '75' },
    { id: 'b', quantity: '40' },
  ];
  const lines = (a: string, b?: string) => [
    { lineId: 'a', receivedQuantity: a },
    ...(b === undefined ? [] : [{ lineId: 'b', receivedQuantity: b }]),
  ];

  it('AC-018-01 todo completo, sin notas: received', () => {
    expect(checkReceiptLines(order, { lines: lines('75', '40') })).toEqual({
      status: 'received',
      differences: [],
    });
  });

  it('AC-018-01 acepta las partidas en cualquier orden', () => {
    const reversed = [
      { lineId: 'b', receivedQuantity: '40' },
      { lineId: 'a', receivedQuantity: '75' },
    ];
    expect(checkReceiptLines(order, { lines: reversed }).status).toBe('received');
  });

  it('AC-018-02 una partida corta con notas: received_with_differences', () => {
    expect(checkReceiptLines(order, { lines: lines('70', '40'), notes: 'Faltaron 5' })).toEqual({
      status: 'received_with_differences',
      differences: [{ lineId: 'a', ordered: '75', received: '70' }],
    });
  });

  it('AC-018-02 una partida en 0 con otra completa cuenta como diferencia', () => {
    const result = checkReceiptLines(order, { lines: lines('0', '40'), notes: 'No llegó' });
    expect(result.differences).toHaveLength(1);
  });

  it.each([undefined, '', '   '])('AC-018-03 con diferencias y notas %j: error notes', (notes) => {
    const error = errorOf(() => checkReceiptLines(order, { lines: lines('70', '40'), notes }));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({ notes: 'Explica qué faltó' });
  });

  it.each([
    ['falta una', lines('75'), 'Captura todas las partidas'],
    [
      'sobra una ajena',
      [...lines('75', '40'), { lineId: 'z', receivedQuantity: '1' }],
      'Hay partidas que no son de esta OC',
    ],
    [
      'repetida',
      [...lines('75', '40'), { lineId: 'a', receivedQuantity: '1' }],
      'Hay partidas repetidas',
    ],
    ['supera lo pedido', lines('76', '40'), 'No puedes recibir más de lo pedido'],
    ['no llegó nada', lines('0', '0'), 'Si no llegó nada, no hay recepción'],
    [
      'negativa',
      lines('-1', '40'),
      'Cantidad inválida: usa números de 0 o más con hasta 3 decimales',
    ],
    [
      '4 decimales',
      lines('1.2345', '40'),
      'Cantidad inválida: usa números de 0 o más con hasta 3 decimales',
    ],
  ])('AC-018-04 rechaza si %s', (_caso, input, message) => {
    const error = errorOf(() => checkReceiptLines(order, { lines: input, notes: 'x' }));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({ lines: message });
  });

  it('AC-018-04 compara con 3 decimales, sin punto flotante', () => {
    const decimals = [{ id: 'a', quantity: '0.3' }];
    expect(() =>
      checkReceiptLines(decimals, { lines: [{ lineId: 'a', receivedQuantity: '0.300' }] }),
    ).not.toThrow();
    expect(
      errorOf(() =>
        checkReceiptLines(decimals, { lines: [{ lineId: 'a', receivedQuantity: '0.301' }] }),
      ).extra.fieldErrors,
    ).toEqual({ lines: 'No puedes recibir más de lo pedido' });
  });

  it('AC-018-05 una OC sin partidas se recibe con lines vacío', () => {
    expect(checkReceiptLines([], { lines: [] })).toEqual({ status: 'received', differences: [] });
  });

  it('AC-018-05 una OC sin partidas rechaza partidas ajenas', () => {
    const error = errorOf(() => checkReceiptLines([], { lines: lines('1') }));
    expect(error.extra.fieldErrors).toEqual({ lines: 'Hay partidas que no son de esta OC' });
  });
});

const extraction: PoExtraction = {
  isPurchaseOrder: true,
  number: ' oc-3001 ',
  supplierName: 'Café Sierra Madre SC',
  supplierTaxId: 'csm 120304 tr5',
  supplierCity: null,
  buyerName: null,
  issuedOn: '2026-10-20',
  currency: 'MXN',
  parlevelRef: 'PL-77',
  lines: [
    {
      sku: 'CAF-1',
      description: 'Café molido 1 kg',
      quantity: 10,
      unit: 'bolsa',
      unitPrice: 100,
      amount: 1000,
      deposit: null,
      receivedQuantity: null,
    },
    {
      sku: null,
      description: 'Filtros',
      quantity: 2,
      unit: 'caja',
      unitPrice: 50.25,
      amount: 100.5,
      deposit: null,
      receivedQuantity: null,
    },
  ],
  subtotal: 1100.5,
  taxes: 176.08,
  total: 1276.58,
  missingFields: [],
  uncertainFields: [],
};

describe('normalizePoExtraction', () => {
  it('AC-014-07 convierte números a texto y normaliza folio y RFC', () => {
    const draft = normalizePoExtraction(extraction);
    expect(draft).toMatchObject({
      number: 'OC-3001',
      supplierTaxId: 'CSM120304TR5',
      subtotal: '1100.50',
      total: '1276.58',
    });
    expect(draft.lines[1]).toEqual({
      sku: null,
      description: 'Filtros',
      quantity: '2',
      unit: 'caja',
      unitPrice: '50.25',
      statedAmount: '100.50',
      deposit: null,
      receivedQuantity: null,
    });
  });

  it('AC-014-07 una fecha con formato raro queda nula y marcada como dudosa', () => {
    const draft = normalizePoExtraction({ ...extraction, issuedOn: '20/10/2026' });
    expect(draft.issuedOn).toBeNull();
    expect(draft.uncertainFields).toContain('issuedOn');
  });
});

describe('buildDraftWarnings', () => {
  const base = normalizePoExtraction(extraction);

  it('AC-014-09 un borrador que cuadra no trae avisos', () => {
    expect(buildDraftWarnings(base, false)).toEqual([]);
  });

  it('AC-014-09 avisa folio repetido y, después, los avisos del proveedor', () => {
    const supplierWarnings = [{ field: 'supplierId', message: 'Proveedor no registrado' }];
    const fields = buildDraftWarnings(base, true, { supplierWarnings }).map((w) => w.field);
    expect(fields).toEqual(['number', 'supplierId']);
  });

  it('AC-014-09 avisa de la partida cuyo importe no coincide con el del PDF', () => {
    const lines = [{ ...base.lines[0]!, statedAmount: '900.00' }, base.lines[1]!];
    const [warning] = buildDraftWarnings({ ...base, lines }, false);
    expect(warning?.field).toBe('lines.0.unitPrice');
    expect(warning?.message).toContain('Partida 1');
  });

  it('AC-014-09 tolera 0.01 de diferencia en una partida', () => {
    const lines = [{ ...base.lines[0]!, statedAmount: '1000.01' }, base.lines[1]!];
    expect(buildDraftWarnings({ ...base, lines }, false)).toEqual([]);
  });

  it('AC-014-09 avisa si la suma de partidas no coincide con el subtotal', () => {
    const [warning] = buildDraftWarnings({ ...base, subtotal: '1200.00' }, false);
    expect(warning?.field).toBe('subtotal');
  });

  it('AC-014-09 avisa cada dato obligatorio faltante de una partida', () => {
    const lines = [{ ...base.lines[0]!, quantity: null, unit: null, statedAmount: null }];
    const fields = buildDraftWarnings({ ...base, subtotal: null, lines }, false).map(
      (w) => w.field,
    );
    expect(fields).toEqual(['lines.0.quantity', 'lines.0.unit']);
  });
});

describe('parseParlevelDate (spec 015)', () => {
  it.each([
    ['08-05-2026', '2026-08-05', true],
    ['08-25-2026', '2026-08-25', false],
    ['8/5/2026', '2026-08-05', true],
    ['05-05-2026', '2026-05-05', false],
    ['2026-08-05', '2026-08-05', false],
    ['25-08-2026', null, false],
    ['02-30-2026', null, false],
    ['ayer', null, false],
  ])('AC-015-01 AC-015-09 «%s» → %s (ambigua: %s)', (text, date, ambiguous) => {
    expect(parseParlevelDate(text)).toEqual({ date, ambiguous });
  });

  it('AC-015-01 normalizePoExtraction convierte la fecha de ParLevel y marca la moneda faltante', () => {
    const draft = normalizePoExtraction({ ...extraction, issuedOn: '08-05-2026', currency: null });
    expect(draft.issuedOn).toBe('2026-08-05');
    expect(draft.currency).toBeNull();
    expect(draft.uncertainFields).toContain('currency');
  });
});

describe('pickSupplier (spec 015)', () => {
  const supplier = (
    id: string,
    name: string,
    taxId: string,
    parlevelName: string | null = null,
  ): SupplierCandidate => ({ id, name, taxId, parlevelName, creditDays: 30, currency: 'MXN' });
  const candidates = [
    supplier('a', 'Empaques Regios SA de CV', 'EDR150720QW9', 'PEPSICO'),
    supplier('b', 'Refrescos del Norte S. de R.L. de C.V.', 'RDN010101AB1'),
    supplier('c', 'Duplicado SA', 'DUP010101AB1'),
    supplier('d', 'Duplicado SC', 'DUP020202AB2'),
  ];
  const read = (supplierName: string | null, supplierTaxId: string | null = null) => ({
    supplierName,
    supplierTaxId,
    supplierCity: 'Monterrey, Nuevo Leon 64890',
  });
  const buyers = ['SMART KIOSKO', 'MIMARK'];

  it('AC-015-03 coincide primero por RFC', () => {
    const picked = pickSupplier(candidates, read('Pepsico', 'RDN010101AB1'), buyers);
    expect(picked).toMatchObject({ supplier: { id: 'b' }, supplierMatch: 'taxId', warnings: [] });
  });

  it('AC-015-03 luego por alias de ParLevel (sin RFC)', () => {
    const picked = pickSupplier(candidates, read('Pepsico'), buyers);
    expect(picked).toMatchObject({ supplier: { id: 'a' }, supplierMatch: 'alias' });
  });

  it('AC-015-03 luego por nombre normalizado y único', () => {
    const picked = pickSupplier(candidates, read('REFRESCOS DEL NORTE'), buyers);
    expect(picked).toMatchObject({ supplier: { id: 'b' }, supplierMatch: 'name' });
  });

  it('AC-015-03 con varios proveedores del mismo nombre no elige ninguno y avisa', () => {
    const picked = pickSupplier(candidates, read('Duplicado'), buyers);
    expect(picked).toMatchObject({ supplier: null, supplierMatch: null, supplierSuggestion: null });
    expect(picked.warnings[0]?.message).toContain('varios proveedores');
  });

  it('AC-015-02 nunca toma al comprador como proveedor', () => {
    const picked = pickSupplier(
      [...candidates, supplier('k', 'Smart Kiosko', 'SKI010101AB1')],
      read('SMART KIOSKO'),
      buyers,
    );
    expect(picked).toMatchObject({ supplier: null, supplierSuggestion: null });
    expect(picked.warnings).toEqual([
      { field: 'supplierName', message: 'El proveedor leído es el comprador; elige el proveedor' },
    ]);
  });

  it('AC-015-04 sin coincidencia sugiere registrar lo que dice el bloque To:', () => {
    const picked = pickSupplier(candidates, read('Bebidas del Golfo'), buyers);
    expect(picked).toMatchObject({
      supplier: null,
      supplierSuggestion: { name: 'Bebidas del Golfo', city: 'Monterrey, Nuevo Leon 64890' },
    });
    expect(picked.warnings[0]).toMatchObject({ field: 'supplierId' });
    expect(picked.warnings[0]?.message).toContain('Proveedor no registrado');
  });
});

describe('buildDraftWarnings · ParLevel (spec 015)', () => {
  const draftLine = (quantity: string, unitPrice: string, statedAmount: string) => ({
    sku: null,
    description: 'Producto',
    quantity,
    unit: 'caja',
    unitPrice,
    statedAmount,
    deposit: '0.00',
    receivedQuantity: '0',
  });
  const draft = {
    ...normalizePoExtraction(extraction),
    lines: [draftLine('40', '149.5', '5980.00')],
    subtotal: '5980.00',
    taxes: null,
    total: null,
  };
  const fields = (d: typeof draft, options = {}) =>
    buildDraftWarnings(d, false, options).map((w) => w.field);

  it('AC-015-10 una partida que cuadra no avisa del importe ni del subtotal', () => {
    expect(fields(draft)).toEqual(['total']);
  });

  it('AC-015-07 sin total en el PDF avisa que la persona debe capturarlo', () => {
    const [warning] = buildDraftWarnings(draft, false);
    expect(warning).toEqual({
      field: 'total',
      message:
        'El PDF de ParLevel no trae impuestos: captura el total de la cotización o la factura',
    });
  });

  it('AC-015-09 AC-015-10 el depósito cuadra el importe y genera su propio aviso', () => {
    const lines = [{ ...draftLine('10', '100', '1025.00'), deposit: '25.00' }];
    const warnings = buildDraftWarnings({ ...draft, lines, subtotal: '1025.00' }, false);
    expect(warnings.map((w) => w.field)).toEqual(['lines.0.deposit', 'total']);
    expect(warnings[0]?.message).toBe(
      'Partida 1: depósito de envase de $25.00 no incluido en el importe',
    );
  });

  it('AC-015-09 avisa si el PDF ya trae cajas recibidas', () => {
    const lines = [{ ...draftLine('40', '149.5', '5980.00'), receivedQuantity: '40' }];
    expect(fields({ ...draft, lines })).toEqual(['lines.0.receivedQuantity', 'total']);
  });

  it('AC-015-09 avisa la fecha ambigua y la fecha futura', () => {
    const withDate = { ...draft, issuedOn: '2026-08-05' };
    const [ambiguous] = buildDraftWarnings(withDate, false, { dateAmbiguous: true });
    expect(ambiguous).toEqual({
      field: 'issuedOn',
      message: 'Fecha leída como 5 ago 2026 (MM-DD-AAAA de ParLevel); revisa',
    });
    expect(fields(withDate, { today: '2026-08-04' })).toEqual(['issuedOn', 'total']);
    expect(fields(withDate, { today: '2026-08-05' })).toEqual(['total']);
  });
});

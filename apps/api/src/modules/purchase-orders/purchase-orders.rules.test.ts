import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import type { PoExtraction } from '@mimark/contracts/extraction';
import {
  buildDraftWarnings,
  checkChecklist,
  checkIssuedOn,
  checkReceipt,
  checkTotalCoversLines,
  impliedTaxes,
  lineAmount,
  linesSubtotal,
  normalizePoExtraction,
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

describe('checkChecklist', () => {
  it('AC-014-05 acepta exactamente las partidas de la OC, en cualquier orden', () => {
    expect(() => checkChecklist(['a', 'b'], ['b', 'a'])).not.toThrow();
  });

  it.each([
    ['falta una', ['a', 'b'], ['a'], 'Marca todas las partidas'],
    ['sobra una ajena', ['a'], ['a', 'z'], 'Hay partidas que no son de esta OC'],
    ['repetida', ['a', 'b'], ['a', 'a'], 'Hay partidas marcadas dos veces'],
    ['OC sin partidas con ids', [], ['a'], 'Hay partidas que no son de esta OC'],
  ])('AC-014-05 rechaza si %s', (_caso, lines, checked, message) => {
    const error = errorOf(() => checkChecklist(lines, checked));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({ checkedLineIds: message });
  });

  it('AC-014-06 una OC sin partidas se recibe con checklist vacío', () => {
    expect(() => checkChecklist([], [])).not.toThrow();
  });
});

const extraction: PoExtraction = {
  isPurchaseOrder: true,
  number: ' oc-3001 ',
  supplierName: 'Café Sierra Madre SC',
  supplierTaxId: 'csm 120304 tr5',
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
    },
    {
      sku: null,
      description: 'Filtros',
      quantity: 2,
      unit: 'caja',
      unitPrice: 50.25,
      amount: 100.5,
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
    });
  });

  it('AC-014-07 una fecha con formato raro queda nula y marcada como dudosa', () => {
    const draft = normalizePoExtraction({ ...extraction, issuedOn: '20/10/2026' });
    expect(draft.issuedOn).toBeNull();
    expect(draft.uncertainFields).toContain('issuedOn');
  });
});

describe('buildDraftWarnings', () => {
  const supplier = { id: 's1', name: 'x', taxId: 'x', creditDays: 0, currency: 'MXN' } as const;
  const base = { ...normalizePoExtraction(extraction), supplier };

  it('AC-014-09 un borrador que cuadra no trae avisos', () => {
    expect(buildDraftWarnings(base, false)).toEqual([]);
  });

  it('AC-014-09 avisa folio repetido y proveedor sin coincidencia', () => {
    const fields = buildDraftWarnings({ ...base, supplier: null }, true).map((w) => w.field);
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

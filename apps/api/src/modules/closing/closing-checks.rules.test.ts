import type { CheckDto } from '@mimark/contracts/closing-review';
import { describe, expect, it } from 'vitest';
import { BANK_BUSINESS_DAYS } from './cantaloupe.assumptions.js';
import {
  canClose,
  canPair,
  categoryForSource,
  MAX_TRANSFER_BUSINESS_DAYS,
  proposeTransfers,
  runChecks,
  type CheckEntry,
  type TransferEntry,
} from './closing-checks.rules.js';

const opts = { businessDays: BANK_BUSINESS_DAYS, maxBusinessDays: MAX_TRANSFER_BUSINESS_DAYS };

const tx = (
  id: string,
  date: string,
  accountId: string,
  amountCents: number,
  rowNumber = 1,
): TransferEntry => ({ id, date, source: 'bank_csv', accountId, amountCents, rowNumber });

describe('categoryForSource', () => {
  it.each([
    ['parlevel_sales', null, 'VENTAS'],
    ['parlevel_waste', { kind: 'waste' }, 'MERMAS'],
    ['parlevel_waste', { kind: 'theft' }, 'ROBOS'],
    ['payroll', null, 'NOMINAS'],
    ['cantaloupe', null, null],
    ['bank_csv', null, null],
    ['cash', null, null],
  ] as const)('AC-023-01 %s %j → %s', (source, meta, code) => {
    expect(categoryForSource({ source, meta })).toBe(code);
  });
});

describe('proposeTransfers', () => {
  it('AC-023-06 empareja monto igual, signo opuesto, cuentas distintas y fechas cercanas', () => {
    const pairs = proposeTransfers(
      [tx('out', '2026-09-03', 'A', -500000), tx('in', '2026-09-03', 'B', 500000)],
      opts,
    );
    expect(pairs).toEqual([['out', 'in']]);
  });

  it('AC-023-06 acepta hasta 2 días hábiles: viernes → lunes son 1, → martes son 2, → miércoles son 3', () => {
    const at = (date: string) =>
      proposeTransfers([tx('out', '2026-09-04', 'A', -100), tx('in', date, 'B', 100)], opts);
    expect(at('2026-09-07')).toHaveLength(1);
    expect(at('2026-09-08')).toHaveLength(1);
    expect(at('2026-09-09')).toHaveLength(0);
  });

  it.each([
    ['la misma cuenta', tx('in', '2026-09-03', 'A', 100)],
    ['otro monto', tx('in', '2026-09-03', 'B', 101)],
    ['el mismo signo', tx('in', '2026-09-03', 'B', -100)],
  ])('AC-023-06 no empareja con %s', (_name, other) => {
    expect(proposeTransfers([tx('out', '2026-09-03', 'A', -100), other], opts)).toEqual([]);
  });

  it('AC-023-06 solo empareja movimientos de banco', () => {
    const cash: TransferEntry = { ...tx('in', '2026-09-03', 'B', 100), source: 'cash' };
    expect(canPair(tx('out', '2026-09-03', 'A', -100), cash, opts)).toBe(false);
  });

  it('AC-023-06 con varios candidatos elige el más cercano y un movimiento va en un solo par', () => {
    const pairs = proposeTransfers(
      [
        tx('out1', '2026-09-03', 'A', -100, 1),
        tx('out2', '2026-09-04', 'A', -100, 2),
        tx('near', '2026-09-03', 'B', 100, 3),
        tx('far', '2026-09-05', 'B', 100, 4),
      ],
      opts,
    );
    expect(pairs).toEqual([
      ['out1', 'near'],
      ['out2', 'far'],
    ]);
  });
});

const entry = (over: Partial<CheckEntry> & { id: string; amountCents: number }): CheckEntry => ({
  accountId: null,
  source: 'cash',
  categoryCode: null,
  kind: 'normal',
  uploadId: null,
  rowNumber: null,
  ...over,
});
const accounts = [{ id: 'A', name: 'BBVA 1234' }];
const byId = (checks: ReturnType<typeof runChecks>, id: string) => {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`falta el cuadre ${id}`);
  return found;
};

describe('runChecks', () => {
  const clean: CheckEntry[] = [
    entry({ id: 's1', source: 'parlevel_sales', amountCents: 100000, categoryCode: 'VENTAS' }),
    entry({ id: 'p1', source: 'payroll', amountCents: -30000, categoryCode: 'NOMINAS' }),
    entry({
      id: 'b1',
      source: 'bank_csv',
      accountId: 'A',
      amountCents: -20000,
      categoryCode: 'RENTAS',
    }),
  ];

  it('AC-023-12 AC-023-13 con todo cuadrado, cada semáforo es ok y trae sus valores', () => {
    const checks = runChecks({
      entries: clean,
      accounts,
      statements: [{ accountId: 'A', openingCents: 50000, closingCents: 30000 }],
    });
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ['sales', 'ok'],
      ['bank_balance:A', 'ok'],
      ['bank_net', 'ok'],
      ['payroll', 'ok'],
      ['uncategorized', 'ok'],
      ['duplicates', 'ok'],
    ]);
    expect(byId(checks, 'sales')).toMatchObject({
      valueA: '1000.00',
      valueB: '1000.00',
      difference: '0.00',
    });
    expect(byId(checks, 'sales').message).toMatch(/mismas/);
  });

  it('AC-023-12 AC-023-13 (a) ventas del reporte distintas de Parlevel: error con los movimientos', () => {
    const checks = runChecks({
      entries: [entry({ id: 's2', source: 'parlevel_sales', amountCents: 5000 }), ...clean],
      accounts,
      statements: [],
    });
    expect(byId(checks, 'sales')).toMatchObject({
      status: 'error',
      valueA: '1050.00',
      valueB: '1000.00',
      difference: '50.00',
      entryIds: ['s2'],
    });
  });

  it('AC-023-12 (b) saldos que no cuadran son error; sin estado de cuenta, warning (nunca ok)', () => {
    const off = runChecks({
      entries: clean,
      accounts,
      statements: [{ accountId: 'A', openingCents: 50000, closingCents: 31000 }],
    });
    expect(byId(off, 'bank_balance:A')).toMatchObject({
      status: 'error',
      valueA: '300.00',
      valueB: '310.00',
      difference: '-10.00',
      entryIds: ['b1'],
    });
    const none = runChecks({ entries: clean, accounts, statements: [] });
    expect(byId(none, 'bank_balance:A').status).toBe('warning');
  });

  it('AC-023-12 (c) los traspasos deben sumar cero', () => {
    const transfers = [
      entry({
        id: 't1',
        source: 'bank_csv',
        accountId: 'A',
        amountCents: -100,
        kind: 'internal_transfer',
      }),
      entry({
        id: 't2',
        source: 'bank_csv',
        accountId: 'B',
        amountCents: 100,
        kind: 'internal_transfer',
      }),
    ];
    expect(
      byId(runChecks({ entries: transfers, accounts, statements: [] }), 'bank_net').status,
    ).toBe('ok');
    expect(
      byId(runChecks({ entries: transfers.slice(0, 1), accounts, statements: [] }), 'bank_net')
        .status,
    ).toBe('error');
  });

  it('AC-023-12 (d) la nómina del reporte debe ser la capturada', () => {
    const checks = runChecks({
      entries: [entry({ id: 'p2', source: 'payroll', amountCents: -1000 }), ...clean],
      accounts,
      statements: [],
    });
    expect(byId(checks, 'payroll')).toMatchObject({ status: 'error', entryIds: ['p2'] });
  });

  it('AC-023-12 (e) un egreso sin categoría es error; un ingreso o una venta Cantaloupe no cuentan', () => {
    const checks = runChecks({
      entries: [
        entry({ id: 'x1', amountCents: -700 }),
        entry({ id: 'x2', amountCents: 900 }),
        entry({ id: 'x3', source: 'cantaloupe', amountCents: -50 }),
        ...clean,
      ],
      accounts,
      statements: [],
    });
    expect(byId(checks, 'uncategorized')).toMatchObject({
      status: 'error',
      valueA: '-7.00',
      entryIds: ['x1'],
    });
  });

  it('AC-023-12 (f) el mismo archivo y fila dos veces es error', () => {
    const dup = [
      entry({ id: 'd1', uploadId: 'u', rowNumber: 2, amountCents: 100 }),
      entry({ id: 'd2', uploadId: 'u', rowNumber: 2, amountCents: 100 }),
      entry({ id: 'd3', uploadId: 'u', rowNumber: 3, amountCents: 100 }),
    ];
    expect(byId(runChecks({ entries: dup, accounts, statements: [] }), 'duplicates')).toMatchObject(
      {
        status: 'error',
        valueA: '2',
        entryIds: ['d1', 'd2'],
      },
    );
  });

  it('AC-023-13 enlaza a lo más 50 movimientos', () => {
    const many = Array.from({ length: 80 }, (_, i) => entry({ id: `m${i}`, amountCents: -100 }));
    expect(
      byId(runChecks({ entries: many, accounts, statements: [] }), 'uncategorized').entryIds,
    ).toHaveLength(50);
  });
});

describe('canClose', () => {
  const ok: CheckDto = {
    id: 'a',
    title: 'a',
    status: 'ok',
    valueA: '0',
    valueB: '0',
    difference: '0',
    message: '',
    entryIds: [],
  };

  it.each<[string, CheckDto[], number, boolean]>([
    ['AC-023-14 sin errores ni pendientes se puede cerrar', [ok], 0, true],
    ['AC-023-14 un warning no bloquea', [{ ...ok, status: 'warning' }], 0, true],
    ['AC-023-14 un error bloquea', [{ ...ok, status: 'error' }], 0, false],
    ['AC-023-14 un movimiento por revisar bloquea', [ok], 1, false],
  ])('%s', (_name, checks, pending, allowed) => {
    expect(canClose(checks, pending).allowed).toBe(allowed);
  });
});

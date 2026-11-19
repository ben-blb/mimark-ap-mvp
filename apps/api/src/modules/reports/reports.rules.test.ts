import { describe, expect, it } from 'vitest';
import {
  buildEdoRes,
  drillLine,
  kioskRows,
  percent,
  reportStatus,
  supplierRows,
  withComparison,
  type ReportCategory,
  type ReportEntry,
  type SupplierRule,
} from './reports.rules.js';

const cat = (code: string, edoResLine: ReportCategory['edoResLine'], i: number): ReportCategory => ({
  id: code,
  code,
  name: code,
  edoResLine,
  sortOrder: i,
});
const categories = [
  cat('VENTAS', 'Ventas', 1),
  cat('OTROS_INGRESOS', 'Otros ingresos', 2),
  cat('COBRANZA_CANTALOUPE', 'Otros ingresos', 3),
  cat('MERMAS', 'Mermas', 4),
  cat('ROBOS', 'Robos', 5),
  cat('COSTO_VENDIDO', 'Costo de lo vendido', 6),
  cat('RENTAS', 'Rentas', 7),
  cat('FEE_CANTALOUPE', 'Fee Cantaloupe', 8),
  cat('IMPUESTOS', 'Impuestos', 9),
  cat('INVERSIONES', 'Inversiones', 10),
];

let n = 0;
const entry = (over: Partial<ReportEntry> & { cents: number }): ReportEntry => ({
  id: `e${++n}`,
  rowNumber: null,
  date: '2026-09-10',
  source: 'bank_csv',
  kind: 'normal',
  categoryId: null,
  needsReview: false,
  kioskId: null,
  concept: 'x',
  ...over,
});
const rowOf = (rows: { key: string; amount: string; percentOfSales: string | null }[], key: string) =>
  rows.find((r) => r.key === key)!;

describe('EDO RES (spec 024)', () => {
  const sample = [
    entry({ categoryId: 'VENTAS', cents: 46398977, source: 'parlevel_sales' }),
    entry({ categoryId: 'COSTO_VENDIDO', cents: -28189394 }),
  ];

  it('AC-024-01 el ejemplo sintético da utilidad bruta 182,095.83 (39.25 %)', () => {
    const { rows } = buildEdoRes(sample, categories);
    expect(rowOf(rows, 'net_sales')).toMatchObject({ amount: '463989.77', percentOfSales: '100.00' });
    expect(rowOf(rows, 'cost').amount).toBe('281893.94');
    expect(rowOf(rows, 'gross_profit')).toMatchObject({
      amount: '182095.83',
      percentOfSales: '39.25',
    });
  });

  it('AC-024-01 los renglones salen en orden: ventas, costo, utilidad bruta, operación, impuestos, neta', () => {
    const keys = buildEdoRes(sample, categories).rows.map((r) => r.key);
    const at = (k: string) => keys.indexOf(k);
    expect(at('net_sales')).toBeLessThan(at('cost'));
    expect(at('cost')).toBeLessThan(at('gross_profit'));
    expect(at('gross_profit')).toBeLessThan(at('Rentas'));
    expect(at('Rentas')).toBeLessThan(at('operating_expenses'));
    expect(at('operating_expenses')).toBeLessThan(at('Impuestos'));
    expect(keys.at(-1)).toBe('net_profit');
  });

  it('AC-024-01 el costo incluye mermas y robos y los gastos restan de la utilidad neta', () => {
    const { rows } = buildEdoRes(
      [
        ...sample,
        entry({ categoryId: 'MERMAS', cents: -1000, source: 'parlevel_waste' }),
        entry({ categoryId: 'ROBOS', cents: -500, source: 'parlevel_waste' }),
        entry({ categoryId: 'RENTAS', cents: -20000 }),
        entry({ categoryId: 'IMPUESTOS', cents: -3000 }),
        entry({ categoryId: 'INVERSIONES', cents: -2500 }),
      ],
      categories,
    );
    expect(rowOf(rows, 'cost').amount).toBe('281908.94');
    expect(rowOf(rows, 'operating_expenses').amount).toBe('200.00');
    expect(rowOf(rows, 'net_profit').amount).toBe(
      ((46398977 - 28189394 - 1000 - 500 - 20000 - 3000 - 2500) / 100).toFixed(2),
    );
  });

  it('AC-024-02 lo que no tiene categoría sale en «Por clasificar» y cuenta en la utilidad neta', () => {
    const { rows } = buildEdoRes([...sample, entry({ cents: -1050 })], categories);
    expect(rowOf(rows, 'unclassified').amount).toBe('-10.50');
    expect(rowOf(rows, 'net_profit').amount).toBe('182085.33');
    expect(buildEdoRes(sample, categories).rows.some((r) => r.key === 'unclassified')).toBe(false);
  });

  it('AC-024-02 un periodo abierto es provisional y solo el cerrado es final', () => {
    expect(reportStatus(3, false)).toBe('provisional');
    expect(reportStatus(3, true)).toBe('final');
  });

  it('AC-024-03 los traspasos, Cantaloupe y su cobranza no entran a ningún renglón', () => {
    const ruido = [
      entry({ kind: 'internal_transfer', cents: -99900 }),
      entry({ kind: 'internal_transfer', cents: 99900 }),
      entry({ source: 'cantaloupe', categoryId: 'VENTAS', cents: 12345 }),
      entry({ categoryId: 'COBRANZA_CANTALOUPE', cents: 777700 }),
    ];
    expect(buildEdoRes([...sample, ...ruido], categories)).toEqual(buildEdoRes(sample, categories));
  });

  it('AC-024-03 sumar en centavos no arrastra error de punto flotante', () => {
    const entries = Array.from({ length: 10 }, () =>
      entry({ categoryId: 'VENTAS', cents: 10, source: 'parlevel_sales' }),
    );
    expect(rowOf(buildEdoRes(entries, categories).rows, 'net_sales').amount).toBe('1.00');
  });

  it('AC-024-03 la utilidad neta es exactamente la suma con signo de los renglones', () => {
    const entries = [
      ...sample,
      entry({ categoryId: 'RENTAS', cents: -1234 }),
      entry({ cents: 55 }),
      entry({ categoryId: 'VENTAS', cents: -3, source: 'parlevel_sales' }),
    ];
    const signed = entries.reduce((acc, e) => acc + e.cents, 0);
    const { rows } = buildEdoRes(entries, categories);
    expect(rowOf(rows, 'net_profit').amount).toBe((signed / 100).toFixed(2));
  });

  it('AC-024-04 sin movimientos todos los renglones están en 0.00 y el estado es empty', () => {
    const { rows, counted } = buildEdoRes([], categories);
    expect(counted).toBe(0);
    expect(rows.every((r) => r.amount === '0.00' && r.percentOfSales === null)).toBe(true);
    expect(reportStatus(counted, false)).toBe('empty');
  });

  it('AC-024-05 el comparativo agrega el importe anterior y la diferencia por renglón', () => {
    const now = buildEdoRes(sample, categories).rows;
    const before = buildEdoRes(
      [entry({ categoryId: 'VENTAS', cents: 40000000, source: 'parlevel_sales' })],
      categories,
    ).rows;
    const rows = withComparison(now, before);
    expect(rowOf(rows, 'net_sales')).toMatchObject({
      previousAmount: '400000.00',
      delta: '63989.77',
    });
    expect(rowOf(rows, 'cost')).toMatchObject({ previousAmount: '0.00', delta: '281893.94' });
  });

  it('AC-024-01 el porcentaje redondea a 2 decimales y es null sin ventas', () => {
    expect(percent(18209583, 46398977)).toBe('39.25');
    expect(percent(-1, 3)).toBe('-33.33');
    expect(percent(5, 0)).toBeNull();
    expect(percent(0, 100)).toBe('0.00');
  });
});

describe('detalle de un renglón (spec 024)', () => {
  const entries = [
    entry({ id: 'a', categoryId: 'RENTAS', cents: -10000, date: '2026-09-05' }),
    entry({ id: 'b', categoryId: 'RENTAS', cents: -20000, date: '2026-09-01' }),
    entry({ id: 'c', categoryId: 'VENTAS', cents: 5000, source: 'parlevel_sales' }),
    entry({ id: 'd', cents: -700 }),
  ];

  it('AC-024-06 la suma del detalle es exactamente el importe del renglón', () => {
    const rentas = drillLine('Rentas', entries, categories);
    expect(rentas.entries.map((e) => e.id)).toEqual(['b', 'a']);
    expect(rentas.amount).toBe('300.00');
    expect(rowOf(buildEdoRes(entries, categories).rows, 'Rentas').amount).toBe(rentas.amount);
    const sinCategoria = drillLine('Por clasificar', entries, categories);
    expect(sinCategoria.amount).toBe('-7.00');
  });

  it('AC-024-08 el renglón agrupado trae el subtotal por categoría', () => {
    const otros = [
      ...entries,
      entry({ categoryId: 'OTROS_INGRESOS', cents: 100 }),
      entry({ categoryId: 'COBRANZA_CANTALOUPE', cents: 999 }),
    ];
    const r = drillLine('Otros ingresos', otros, categories);
    expect(r.categories).toEqual([{ code: 'OTROS_INGRESOS', name: 'OTROS_INGRESOS', amount: '1.00', count: 1 }]);
  });
});

describe('kioskos (spec 024)', () => {
  const kiosks = [
    { id: 'k1', name: 'Alfa' },
    { id: 'k2', name: 'Beta' },
  ];
  const entries = [
    entry({ kioskId: 'k1', categoryId: 'VENTAS', cents: 100000, source: 'parlevel_sales' }),
    entry({ kioskId: 'k1', categoryId: 'COSTO_VENDIDO', cents: -60000 }),
    entry({ kioskId: 'k1', categoryId: 'MERMAS', cents: -2000, source: 'parlevel_waste' }),
    entry({ kioskId: 'k1', categoryId: 'ROBOS', cents: -1000, source: 'parlevel_waste' }),
    entry({ kioskId: 'k1', categoryId: 'FEE_CANTALOUPE', cents: -500 }),
    entry({ kioskId: 'k2', categoryId: 'VENTAS', cents: 10000, source: 'parlevel_sales' }),
    entry({ kioskId: 'k2', categoryId: 'COSTO_VENDIDO', cents: -30000 }),
    entry({ kioskId: null, categoryId: 'VENTAS', cents: 2000, source: 'parlevel_sales' }),
    entry({ kioskId: 'k1', categoryId: 'RENTAS', cents: -4000 }),
    entry({ kioskId: null, categoryId: 'IMPUESTOS', cents: -300 }),
    entry({ cents: -50 }),
  ];

  it('AC-024-09 margen, mermas, robos, comisiones y utilidad antes de gastos generales por kiosko', () => {
    const { rows } = kioskRows(entries, categories, kiosks);
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Beta', 'Sin kiosko']);
    expect(rows[0]).toMatchObject({
      sales: '1000.00',
      cost: '600.00',
      margin: '400.00',
      marginPercent: '40.00',
      waste: '20.00',
      theft: '10.00',
      commissions: '5.00',
      profitBeforeOverhead: '365.00',
      negativeMargin: false,
    });
  });

  it('AC-024-09 kioskos más «Sin kiosko» igualan los totales del EDO RES', () => {
    const k = kioskRows(entries, categories, kiosks);
    const edo = buildEdoRes(entries, categories).rows;
    expect(k.totals.sales).toBe(rowOf(edo, 'net_sales').amount);
    expect(k.totals.sales).toBe('1120.00');
    expect(k.totals.cost).toBe('900.00');
    // utilidad neta = utilidad antes de gastos generales − gastos generales + por clasificar
    const net =
      Number(k.totals.profitBeforeOverhead) * 100 - Number(k.overhead) * 100 + Number(k.unclassified) * 100;
    expect(net / 100).toBe(Number(rowOf(edo, 'net_profit').amount));
  });

  it('AC-024-10 el margen negativo se marca', () => {
    const { rows } = kioskRows(entries, categories, kiosks);
    expect(rows[1]).toMatchObject({ margin: '-200.00', marginPercent: '-200.00', negativeMargin: true });
  });

  it('AC-024-11 los gastos generales no se prorratean: van aparte aunque tengan kiosko', () => {
    const k = kioskRows(entries, categories, kiosks);
    expect(k.overhead).toBe('43.00');
    expect(k.rows[0]!.profitBeforeOverhead).toBe('365.00');
    expect(k.unclassified).toBe('-0.50');
  });

  it('AC-024-09 un kiosko sin catálogo se muestra como desconocido, no se pierde', () => {
    const { rows } = kioskRows(
      [entry({ kioskId: 'zz', categoryId: 'VENTAS', cents: 100, source: 'parlevel_sales' })],
      categories,
      kiosks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Kiosko desconocido');
  });
});

describe('proveedores (spec 024)', () => {
  const rule = (id: string, pattern: string, priority = 0): SupplierRule => ({
    id,
    pattern,
    patternKey: pattern.toLowerCase(),
    priority,
    active: true,
    categoryId: 'COSTO_VENDIDO',
  });
  const rules = [rule('r1', 'COCA COLA'), rule('r2', 'BIMBO')];
  const pay = (concept: string, cents: number, date: string, over: Partial<ReportEntry> = {}) =>
    entry({ categoryId: 'COSTO_VENDIDO', concept, cents, date, ...over });

  it('AC-024-12 pago total, número de pagos, ticket promedio, % del gasto y primer y último pago', () => {
    const { rows, totalSpend } = supplierRows(
      [
        pay('PAGO COCA COLA FEMSA', -30000, '2026-09-10'),
        pay('pago coca cola', -10000, '2026-09-02'),
        pay('BIMBO SA', -10000, '2026-09-20'),
      ],
      categories,
      rules,
    );
    expect(totalSpend).toBe('500.00');
    expect(rows[0]).toEqual({
      name: 'COCA COLA',
      total: '400.00',
      count: 2,
      average: '200.00',
      percentOfSpend: '80.00',
      firstPaymentOn: '2026-09-02',
      lastPaymentOn: '2026-09-10',
    });
    expect(rows[1]!.name).toBe('BIMBO');
  });

  it('AC-024-13 sin regla de proveedor, otra categoría, ingresos y traspasos no aparecen', () => {
    const { rows } = supplierRows(
      [
        pay('PROVEEDOR SIN REGLA', -5000, '2026-09-03'),
        pay('COCA COLA DEVOLUCION', 5000, '2026-09-03'),
        pay('COCA COLA', -5000, '2026-09-03', { kind: 'internal_transfer' }),
        entry({ categoryId: 'RENTAS', concept: 'COCA COLA', cents: -5000 }),
      ],
      categories,
      rules,
    );
    expect(rows).toEqual([]);
  });

  it('AC-024-13 gana la regla activa de mayor prioridad y una inactiva no cuenta', () => {
    const { rows } = supplierRows(
      [pay('COCA COLA BIMBO', -1000, '2026-09-03')],
      categories,
      [rule('r1', 'COCA COLA'), rule('r2', 'BIMBO', 5), { ...rule('r3', 'COCA', 9), active: false }],
    );
    expect(rows.map((r) => r.name)).toEqual(['BIMBO']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  analyzeSheet,
  detectColumns,
  monthOf,
  normalizeRow,
  type KioskLookup,
} from './source-parsers.rules.js';

const kiosks: KioskLookup = {
  byAsset: new Map([['1c-ftlalnepantla', 'k1']]),
  byDevice: new Map([['plk003627', 'k2']]),
};
const ctx = (columns: Record<string, number>, extra = {}) => ({
  columns,
  kiosks,
  ...extra,
});

describe('detectColumns', () => {
  it('AC-021-03 reconoce las columnas sin importar orden, mayúsculas ni acentos', () => {
    const found = detectColumns('bank_csv', ['Depósitos', 'FECHA', 'Concepto', 'Retiros', 'Saldo']);
    expect(found.missing).toEqual([]);
    expect(found.columns).toMatchObject({ deposits: 0, date: 1, concept: 2, withdrawals: 3 });
  });

  it('AC-021-03 lista las columnas obligatorias que faltan', () => {
    const found = detectColumns('parlevel_sales', ['Date', 'Commission']);
    expect(found.missing).toEqual(['Asset', 'Sales']);
  });

  it('AC-021-03 una columna opcional ausente no es un faltante', () => {
    expect(detectColumns('parlevel_sales', ['Asset', 'Date', 'Sales']).missing).toEqual([]);
  });
});

describe('normalizeRow', () => {
  const sales = ctx({ asset: 0, date: 1, sales: 2, commission: 3 });

  it('AC-021-08 ventas de Parlevel: ingreso positivo por kiosko, con comisión en meta', () => {
    const result = normalizeRow(
      'parlevel_sales',
      ['1C-FTLALNEPANTLA', '2026-09-03', 1500.5, 51],
      sales,
    );
    expect(result).toEqual({
      entry: {
        date: '2026-09-03',
        kioskId: 'k1',
        concept: 'Ventas',
        amount: '1500.50',
        needsReview: false,
        flags: [],
        meta: { commission: '51.00' },
      },
    });
  });

  it('AC-021-05 un Asset que no está en el catálogo queda sin kiosko y marcado, no se descarta', () => {
    const result = normalizeRow('parlevel_sales', ['ZZ-999', '2026-09-03', 10, null], sales);
    expect(result).toMatchObject({
      entry: { kioskId: null, needsReview: true, flags: ['UNKNOWN_KIOSK:ZZ-999'] },
    });
  });

  it('AC-021-05 Cantaloupe identifica el kiosko por Device ID', () => {
    const cantaloupe = ctx({
      device: 0,
      date: 1,
      amount: 2,
      transactions: 3,
      discountRate: 4,
      vat: 5,
    });
    expect(
      normalizeRow(
        'cantaloupe',
        ['PLK003627', '2026-09-04', '980.00', 12, '3.4', '4.51'],
        cantaloupe,
      ),
    ).toMatchObject({
      entry: {
        kioskId: 'k2',
        amount: '980.00',
        meta: { transactions: 12, discountRate: '3.4', vat: '4.51' },
      },
    });
    expect(normalizeRow('cantaloupe', ['PLK000000', '2026-09-04', 5], cantaloupe)).toMatchObject({
      entry: { kioskId: null, flags: ['UNKNOWN_KIOSK:PLK000000'] },
    });
  });

  it('AC-021-08 mermas y robos son egresos (negativos) y distinguen el tipo', () => {
    const waste = ctx({ asset: 0, date: 1, type: 2, amount: 3 });
    expect(
      normalizeRow('parlevel_waste', ['1C-FTLALNEPANTLA', '2026-09-05', 'Merma', '80'], waste),
    ).toMatchObject({
      entry: { amount: '-80.00', concept: 'Merma', meta: { kind: 'waste' } },
    });
    expect(
      normalizeRow('parlevel_waste', ['1C-FTLALNEPANTLA', '2026-09-05', 'Robo', '-20'], waste),
    ).toMatchObject({
      entry: { amount: '-20.00', concept: 'Robo', meta: { kind: 'theft' } },
    });
    expect(
      normalizeRow('parlevel_waste', ['1C-FTLALNEPANTLA', '2026-09-05', 'Otro', '5'], waste),
    ).toEqual({
      reject: 'Tipo desconocido: Otro',
    });
  });

  it('AC-021-08 banco: depósito positivo, retiro negativo y la cuenta viene del upload', () => {
    const bank = ctx({ date: 0, concept: 1, withdrawals: 2, deposits: 3 }, { accountId: 'a1' });
    expect(
      normalizeRow('bank_csv', ['03/09/2026', 'ADT SECURITY CR MU', '1,200.00', ''], bank),
    ).toMatchObject({
      entry: {
        date: '2026-09-03',
        amount: '-1200.00',
        concept: 'ADT SECURITY CR MU',
        kioskId: null,
      },
    });
    expect(normalizeRow('bank_csv', ['03/09/2026', 'DEPOSITO', '', '500'], bank)).toMatchObject({
      entry: { amount: '500.00' },
    });
    expect(normalizeRow('bank_csv', ['03/09/2026', 'SIN IMPORTE', '', ''], bank)).toEqual({
      reject: 'Falta el importe',
    });
  });

  it('AC-021-08 caja: Entrada suma y Salida resta; nómina siempre resta', () => {
    const cash = ctx({ date: 0, concept: 1, amount: 2, kind: 3 });
    expect(normalizeRow('cash', ['2026-09-10', 'Fondo', 300, 'Entrada'], cash)).toMatchObject({
      entry: { amount: '300.00' },
    });
    expect(normalizeRow('cash', ['2026-09-10', 'Gasolina', 150, 'salida'], cash)).toMatchObject({
      entry: { amount: '-150.00' },
    });
    expect(normalizeRow('cash', ['2026-09-10', 'Gasolina', 150, 'Otro'], cash)).toEqual({
      reject: 'Tipo desconocido: Otro (usa Entrada o Salida)',
    });
    const payroll = ctx({ date: 0, name: 1, amount: 2, imss: 3 });
    expect(
      normalizeRow('payroll', ['2026-09-15', 'Ana Prueba', '5,000', 'sí'], payroll),
    ).toMatchObject({
      entry: { amount: '-5000.00', concept: 'Ana Prueba' },
    });
  });

  it('AC-021-04 una fecha o un importe ilegibles rechazan la fila con su motivo', () => {
    expect(normalizeRow('parlevel_sales', ['1C-FTLALNEPANTLA', 'ayer', 10, null], sales)).toEqual({
      reject: 'Fecha inválida',
    });
    expect(
      normalizeRow('parlevel_sales', ['1C-FTLALNEPANTLA', '2026-09-03', 'diez', null], sales),
    ).toEqual({
      reject: 'Importe inválido',
    });
  });

  it('AC-021-14 una celda =CMD() se guarda como texto, sin ejecutarse', () => {
    const cash = ctx({ date: 0, concept: 1, amount: 2, kind: 3 });
    expect(normalizeRow('cash', ['2026-09-10', '=CMD()', 10, 'Entrada'], cash)).toMatchObject({
      entry: { concept: '=CMD()' },
    });
  });
});

describe('monthOf', () => {
  it('AC-021-04 devuelve el mes más frecuente', () => {
    expect(monthOf(['2026-08-30', '2026-09-01', '2026-09-02'])).toBe('2026-09');
    expect(monthOf([])).toBeNull();
  });
});

describe('analyzeSheet', () => {
  const header = ['Asset', 'Date', 'Sales'];
  const run = (rows: unknown[][], month = '2026-09') =>
    analyzeSheet('parlevel_sales', rows, { month, kiosks });

  it('AC-021-01 cuenta filas leídas, rechazadas y sin kiosko, y suma el total con signo', () => {
    const result = run([
      header,
      ['1C-FTLALNEPANTLA', '2026-09-01', 100],
      ['ZZ-1', '2026-09-02', 50.25],
      ['1C-FTLALNEPANTLA', 'mala', 10],
      [null, null, null], // fila vacía: ni se lee ni se rechaza
    ]);
    expect(result.rowsRead).toBe(3);
    expect(result.rejected).toEqual([{ row: 4, reason: 'Fecha inválida' }]);
    expect(result.entries.map((e) => e.row)).toEqual([2, 3]);
    expect(result.entries[1]?.entry.flags).toEqual(['UNKNOWN_KIOSK:ZZ-1']);
  });

  it('AC-021-03 faltan columnas: error SOURCE_MISSING_COLUMNS con la lista', () => {
    expect(() =>
      run([
        ['Asset', 'Date'],
        ['A', '2026-09-01'],
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: 'SOURCE_MISSING_COLUMNS',
        extra: { details: { missing: ['Sales'] } },
      }),
    );
  });

  it('AC-021-04 fechas de otro mes: SOURCE_WRONG_MONTH con el mes detectado', () => {
    expect(() =>
      run([header, ['1C-FTLALNEPANTLA', '2026-08-01', 1], ['1C-FTLALNEPANTLA', '2026-08-02', 1]]),
    ).toThrowError(
      expect.objectContaining({
        code: 'SOURCE_WRONG_MONTH',
        extra: { details: { detected: '2026-08', expected: '2026-09' } },
      }),
    );
  });

  it('AC-021-04 una sola fila fuera del mes basta para rechazar el archivo', () => {
    expect(() =>
      run([header, ['1C-FTLALNEPANTLA', '2026-09-01', 1], ['1C-FTLALNEPANTLA', '2026-10-01', 1]]),
    ).toThrowError(expect.objectContaining({ code: 'SOURCE_WRONG_MONTH' }));
  });

  it('AC-021-03 un archivo vacío no tiene cabecera: faltan todas las obligatorias', () => {
    expect(() => run([])).toThrowError(expect.objectContaining({ code: 'SOURCE_MISSING_COLUMNS' }));
  });
});

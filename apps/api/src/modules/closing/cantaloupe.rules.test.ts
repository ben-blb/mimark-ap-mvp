import { describe, expect, it } from 'vitest';
import {
  BANK_BUSINESS_DAYS,
  CANTALOUPE_TOLERANCE_CENTS,
  CANTALOUPE_VAT_BP,
} from './cantaloupe.assumptions.js';
import { cantaloupeExpected, rateToBp, reconcileDays } from './cantaloupe.rules.js';

const opts = {
  rateBp: 340,
  vatBp: CANTALOUPE_VAT_BP,
  toleranceCents: CANTALOUPE_TOLERANCE_CENTS,
  businessDays: BANK_BUSINESS_DAYS,
};

describe('cantaloupeExpected', () => {
  it.each([
    // ventas, comisión, IVA, esperado (centavos)
    [833650, 28344, 4535, 800771], // el ejemplo de la spec: 8,336.50 → 283.44 + 45.35 → 8,007.71
    [100000, 3400, 544, 96056],
    [0, 0, 0, 0],
    [1470, 50, 8, 1412], // 49.98 → 50; 8.0 → 8
    [-10000, -340, -54, -9606], // una devolución neta resta con el mismo redondeo
  ])('AC-023-09 ventas %i → comisión %i, IVA %i, esperado %i', (sales, commission, vat, expected) => {
    expect(cantaloupeExpected(sales, 340, 1600)).toEqual({ commission, vat, expected });
  });

  it('AC-023-09 redondea mitad hacia arriba cada paso antes de restar', () => {
    // 1,000.00 × 3.4 % = 34.00; 250 × 3.4 % = 8.5 → 9 (mitad hacia arriba)
    expect(cantaloupeExpected(25000, 340, 1600).commission).toBe(850);
    expect(cantaloupeExpected(25001, 340, 1600).commission).toBe(850); // 850.034 → 850
    expect(cantaloupeExpected(1250, 340, 1600).commission).toBe(43); // 42.5 → 43
  });

  it('AC-023-09 la tasa viene como texto de la base', () => {
    expect(rateToBp('0.0340')).toBe(340);
    expect(rateToBp('0.029')).toBe(290);
  });
});

describe('reconcileDays', () => {
  const sale = (date: string, cents: number) => ({ date, cents });

  it('AC-023-10 compara el esperado con el depósito del día y da la diferencia', () => {
    const [row] = reconcileDays(
      [sale('2026-09-01', 833650)],
      [sale('2026-09-01', 800771)],
      opts,
    );
    expect(row).toMatchObject({
      date: '2026-09-01',
      groupedDays: [],
      sales: 833650,
      commission: 28344,
      vat: 4535,
      expected: 800771,
      deposit: 800771,
      difference: 0,
      status: 'ok',
    });
  });

  it.each([
    ['AC-023-11 dentro de la tolerancia es ok', 800771 + 50, 'ok'],
    ['AC-023-11 por debajo de la tolerancia (−0.50) es ok', 800771 - 50, 'ok'],
    ['AC-023-11 un centavo fuera de la tolerancia es warning', 800771 + 51, 'warning'],
  ])('%s', (_name, deposit, status) => {
    const [row] = reconcileDays([sale('2026-09-01', 833650)], [sale('2026-09-01', deposit)], opts);
    expect(row?.status).toBe(status);
  });

  it('AC-023-11 ventas sin depósito: missing; depósito sin ventas: orphan', () => {
    const rows = reconcileDays(
      [sale('2026-09-01', 10000)],
      [sale('2026-09-02', 5000)],
      opts,
    );
    expect(rows.map((r) => [r.date, r.status])).toEqual([
      ['2026-09-01', 'missing'],
      ['2026-09-02', 'orphan'],
    ]);
  });

  it('AC-023-10 sábado y domingo se concilian con el lunes en un solo renglón', () => {
    // 2026-09-05 sábado, 06 domingo, 07 lunes
    const rows = reconcileDays(
      [sale('2026-09-05', 10000), sale('2026-09-06', 20000), sale('2026-09-07', 30000)],
      [sale('2026-09-07', 57634)],
      opts,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-07',
      groupedDays: ['2026-09-05', '2026-09-06', '2026-09-07'],
      sales: 60000,
      expected: 57634,
      difference: 0,
      status: 'ok',
    });
  });

  it('AC-023-11 un día entre semana sin depósito no se mezcla con el siguiente', () => {
    const rows = reconcileDays(
      [sale('2026-09-01', 10000), sale('2026-09-02', 10000)],
      [sale('2026-09-02', 9606)],
      opts,
    );
    expect(rows.map((r) => [r.date, r.status])).toEqual([
      ['2026-09-01', 'missing'],
      ['2026-09-02', 'ok'],
    ]);
  });

  it('AC-023-09 suma varios kioskos y varios depósitos del mismo día', () => {
    const [row] = reconcileDays(
      [sale('2026-09-01', 5000), sale('2026-09-01', 5000)],
      [sale('2026-09-01', 4000), sale('2026-09-01', 5606)],
      opts,
    );
    expect(row).toMatchObject({ sales: 10000, expected: 9606, deposit: 9606, status: 'ok' });
  });
});

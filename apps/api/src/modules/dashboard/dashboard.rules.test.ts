import { describe, expect, it } from 'vitest';
import { summarizePortfolio, type PortfolioRow } from './dashboard.rules.js';

const row = (over: Partial<PortfolioRow> & Pick<PortfolioRow, 'id'>): PortfolioRow => ({
  supplierName: 'Proveedor',
  invoiceNumber: `F-${over.id}`,
  totalCents: 100000,
  currency: 'MXN',
  status: 'confirmed',
  dueOn: '2026-10-30',
  suggestedPayOn: '2026-10-28',
  scheduledPayOn: null,
  urgent: false,
  paidOn: null,
  ...over,
});

const today = '2026-10-20';

/** Ejemplo de la spec: hoy 2026-10-20, horizonte 7. */
const A = row({ id: 'A', dueOn: '2026-10-15', suggestedPayOn: '2026-10-21', urgent: true });
const B = row({ id: 'B', dueOn: '2026-10-22', totalCents: 50000, suggestedPayOn: '2026-10-21' });
const C = row({ id: 'C', dueOn: '2026-10-30', totalCents: 10000, currency: 'USD' });
const D = row({
  id: 'D',
  status: 'paid',
  paidOn: '2026-10-05',
  totalCents: 20000,
  dueOn: '2026-10-08',
});

describe('summarizePortfolio', () => {
  const dto = summarizePortfolio([A, B, C, D], today, 7, 4);

  it('AC-006-02 los totales salen por moneda, sin mezclar MXN y USD (tabla de la spec)', () => {
    expect(dto.totals.overdue).toEqual({ count: 1, amount: { MXN: '1000.00', USD: '0.00' } });
    expect(dto.totals.upcoming).toEqual({ count: 1, amount: { MXN: '500.00', USD: '0.00' } });
    expect(dto.totals.pending).toEqual({ count: 3, amount: { MXN: '1500.00', USD: '100.00' } });
    expect(dto.totals.paidThisMonth).toEqual({ count: 1, amount: { MXN: '200.00', USD: '0.00' } });
  });

  it('AC-006-02 informa cuántos expedientes están en revisión', () => {
    expect(dto.inReview).toBe(4);
  });

  it('AC-006-01 la lista trae lo vencido y lo que vence dentro del horizonte, vencidos primero', () => {
    expect(dto.items.map((i) => i.id)).toEqual(['A', 'B']); // C vence fuera del horizonte
    expect(dto.items[0]).toMatchObject({ overdue: true, urgent: true, payOn: '2026-10-21' });
    expect(dto.items[1]).toMatchObject({ overdue: false, total: '500.00', currency: 'MXN' });
  });

  it('AC-006-01 con un horizonte mayor entra lo que vence más tarde', () => {
    const ids = (horizon: number) =>
      summarizePortfolio([A, B, C, D], today, horizon, 0).items.map((i) => i.id);
    expect(ids(7)).toEqual(['A', 'B']);
    expect(ids(15)).toEqual(['A', 'B', 'C']); // C vence el 30 de octubre: a 10 días
    expect(ids(30)).toEqual(['A', 'B', 'C']);
  });

  it('AC-006-01 ordena por día de pago (el programado manda sobre el sugerido), vencidos primero', () => {
    const late = row({ id: 'late', dueOn: '2026-10-10', suggestedPayOn: '2026-10-23' });
    const early = row({
      id: 'early',
      dueOn: '2026-10-12',
      suggestedPayOn: '2026-10-28',
      scheduledPayOn: '2026-10-21',
      status: 'scheduled',
    });
    const soon = row({ id: 'soon', dueOn: '2026-10-21', suggestedPayOn: '2026-10-21' });
    const result = summarizePortfolio([soon, late, early], today, 7, 0);
    expect(result.items.map((i) => [i.id, i.payOn])).toEqual([
      ['early', '2026-10-21'],
      ['late', '2026-10-23'],
      ['soon', '2026-10-21'],
    ]);
  });

  it('AC-006-03 agrupa lo por pagar por día de pago, con número e importe por moneda', () => {
    const grouped = summarizePortfolio(
      [
        row({ id: '1', suggestedPayOn: '2026-10-28' }),
        row({ id: '2', suggestedPayOn: '2026-10-28', totalCents: 25050, currency: 'USD' }),
        row({
          id: '3',
          suggestedPayOn: '2026-10-21',
          scheduledPayOn: '2026-10-30',
          status: 'scheduled',
        }),
        D,
      ],
      today,
      30,
      0,
    );
    expect(grouped.byPayDay).toEqual([
      { payOn: '2026-10-28', count: 2, amount: { MXN: '1000.00', USD: '250.50' } },
      { payOn: '2026-10-30', count: 1, amount: { MXN: '1000.00', USD: '0.00' } },
    ]);
  });

  it('AC-006-05 lo que vence hoy está por pagar, no vencido', () => {
    const dueToday = row({ id: 'hoy', dueOn: today, suggestedPayOn: '2026-10-21' });
    const result = summarizePortfolio([dueToday], today, 7, 0);
    expect(result.totals.overdue.count).toBe(0);
    expect(result.totals.upcoming.count).toBe(1);
    expect(result.items[0]?.overdue).toBe(false);
    // Un día después ya es vencido.
    expect(summarizePortfolio([dueToday], '2026-10-21', 7, 0).totals.overdue.count).toBe(1);
  });

  it('AC-006-02 pagado en el mes en curso: otro mes no cuenta', () => {
    const lastMonth = row({ id: 'sep', status: 'paid', paidOn: '2026-09-30', totalCents: 99900 });
    const result = summarizePortfolio([D, lastMonth], today, 7, 0);
    expect(result.totals.paidThisMonth.count).toBe(1);
    expect(result.totals.pending.count).toBe(0);
  });

  it('un tablero vacío tiene ceros en ambas monedas', () => {
    const empty = summarizePortfolio([], today, 15, 0);
    expect(empty.totals.pending).toEqual({ count: 0, amount: { MXN: '0.00', USD: '0.00' } });
    expect(empty.items).toEqual([]);
    expect(empty.byPayDay).toEqual([]);
    expect(empty).toMatchObject({ today, horizon: 15 });
  });
});

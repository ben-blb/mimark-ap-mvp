import type { CantaloupeStatus } from '@mimark/contracts/closing-review';
import { onOrNextWeekday } from '../../common/dates.js';
import type { LocalDate } from '@mimark/contracts/common';

/** Conciliación de Cantaloupe contra el banco (spec 023): puras, todo en centavos. */

/** Suma `halfUp(n × bp / 10000)` con enteros: 28344.1 → 28344, 4535.5 → 4536. Simétrico para negativos. */
function applyRate(cents: number, bp: number): number {
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) * bp + 5000) / 10000);
}

/** Comisión e IVA se redondean a centavos cada uno antes de restar (AC-023-09). */
export function cantaloupeExpected(
  salesCents: number,
  rateBp: number,
  vatBp: number,
): { commission: number; vat: number; expected: number } {
  const commission = applyRate(salesCents, rateBp);
  const vat = applyRate(commission, vatBp);
  return { commission, vat, expected: salesCents - commission - vat };
}

/** «0.0340» → 340. */
export function rateToBp(rate: string): number {
  return Math.round(Number(rate) * 10000);
}

export interface DayAmount {
  date: LocalDate;
  cents: number;
}

export interface CantaloupeRow {
  /** Día del depósito esperado. */
  date: LocalDate;
  /** Los días que entran en el renglón, solo si son más de uno. */
  groupedDays: LocalDate[];
  sales: number;
  commission: number;
  vat: number;
  expected: number;
  deposit: number;
  difference: number;
  status: CantaloupeStatus;
}

export interface ReconcileOptions {
  rateBp: number;
  vatBp: number;
  toleranceCents: number;
  businessDays: readonly number[];
}

/**
 * Ventas de Cantaloupe contra depósitos del banco, por día (AC-023-09 a 11). Los días en que el banco no abona se
 * concilian con el siguiente día que sí; un día entre semana sin depósito queda `missing`.
 */
export function reconcileDays(
  sales: readonly DayAmount[],
  deposits: readonly DayAmount[],
  opts: ReconcileOptions,
): CantaloupeRow[] {
  const groups = new Map<
    LocalDate,
    { days: Set<LocalDate>; sales: number; hasSales: boolean; deposit: number; hasDeposit: boolean }
  >();
  const group = (date: LocalDate) => {
    const key = onOrNextWeekday(date, opts.businessDays);
    let found = groups.get(key);
    if (!found) {
      found = { days: new Set(), sales: 0, hasSales: false, deposit: 0, hasDeposit: false };
      groups.set(key, found);
    }
    return found;
  };
  for (const day of sales) {
    const g = group(day.date);
    g.days.add(day.date);
    g.sales += day.cents;
    g.hasSales = true;
  }
  for (const day of deposits) {
    const g = group(day.date);
    g.days.add(day.date);
    g.deposit += day.cents;
    g.hasDeposit = true;
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, g]) => {
      const { commission, vat, expected } = cantaloupeExpected(g.sales, opts.rateBp, opts.vatBp);
      const difference = g.deposit - expected;
      const days = [...g.days].sort();
      return {
        date,
        groupedDays: days.length > 1 ? days : [],
        sales: g.sales,
        commission,
        vat,
        expected,
        deposit: g.deposit,
        difference,
        status: statusOf(g, difference, opts.toleranceCents),
      };
    });
}

function statusOf(
  g: { hasSales: boolean; hasDeposit: boolean },
  difference: number,
  tolerance: number,
): CantaloupeStatus {
  if (g.hasSales && !g.hasDeposit) return 'missing';
  if (!g.hasSales) return 'orphan';
  return Math.abs(difference) <= tolerance ? 'ok' : 'warning';
}

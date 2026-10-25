import type { Currency, LocalDate } from '@mimark/contracts/common';
import type { Bucket, DashboardDto, MoneyByCurrency } from '@mimark/contracts/dashboard';
import { addDays } from '../../common/dates.js';
import { centsToMoney } from '../../common/money.js';

/** Un expediente tal como lo necesita el tablero (importes en centavos). */
export interface PortfolioRow {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  totalCents: number;
  currency: Currency;
  status: 'confirmed' | 'scheduled' | 'paid';
  dueOn: LocalDate;
  suggestedPayOn: LocalDate;
  scheduledPayOn: LocalDate | null;
  urgent: boolean;
  paidOn: LocalDate | null;
}

type Cents = Record<Currency, number>;
const zero = (): Cents => ({ MXN: 0, USD: 0 });

/** Suma por moneda: nunca se mezclan MXN y USD. */
function bucket(rows: PortfolioRow[]): Bucket {
  const cents = zero();
  for (const r of rows) cents[r.currency] += r.totalCents;
  return { count: rows.length, amount: toMoney(cents) };
}

function toMoney(cents: Cents): MoneyByCurrency {
  return { MXN: centsToMoney(cents.MXN), USD: centsToMoney(cents.USD) };
}

const payOn = (r: PortfolioRow): LocalDate => r.scheduledPayOn ?? r.suggestedPayOn;

/**
 * Resume la cartera para el tablero. `today` ya viene en la zona del negocio: lo que vence hoy está por pagar,
 * no vencido. `inReview` es el conteo de expedientes en revisión o por confirmar (lo da la base).
 */
export function summarizePortfolio(
  rows: PortfolioRow[],
  today: LocalDate,
  horizon: number,
  inReview: number,
): DashboardDto {
  const pending = rows.filter((r) => r.status !== 'paid');
  const overdue = pending.filter((r) => r.dueOn < today);
  const limit = addDays(today, horizon);
  const upcoming = pending.filter((r) => r.dueOn >= today && r.dueOn <= limit);
  const month = today.slice(0, 7);
  const paid = rows.filter((r) => r.status === 'paid' && r.paidOn?.startsWith(month));

  const items = [...overdue, ...upcoming]
    .sort(
      (a, b) =>
        Number(b.dueOn < today) - Number(a.dueOn < today) ||
        payOn(a).localeCompare(payOn(b)) ||
        a.dueOn.localeCompare(b.dueOn) ||
        a.id.localeCompare(b.id),
    )
    .map((r) => ({
      id: r.id,
      supplierName: r.supplierName,
      invoiceNumber: r.invoiceNumber,
      total: centsToMoney(r.totalCents),
      currency: r.currency,
      dueOn: r.dueOn,
      payOn: payOn(r),
      status: r.status as 'confirmed' | 'scheduled',
      urgent: r.urgent,
      overdue: r.dueOn < today,
    }));

  const days = [...new Set(pending.map(payOn))].sort();
  const byPayDay = days.map((day) => ({
    payOn: day,
    ...(({ count, amount }) => ({ count, amount }))(
      bucket(pending.filter((r) => payOn(r) === day)),
    ),
  }));

  return {
    today,
    horizon,
    totals: {
      pending: bucket(pending),
      overdue: bucket(overdue),
      upcoming: bucket(upcoming),
      paidThisMonth: bucket(paid),
    },
    inReview,
    byPayDay,
    items,
  };
}

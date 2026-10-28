import type { DashboardDto, MoneyByCurrency } from '@mimark/contracts/dashboard';

export type DueBucketKey = 'overdue' | 'week' | 'horizon' | 'later';

export interface DueBucket {
  key: DueBucketKey;
  label: string;
  count: number;
  amount: MoneyByCurrency;
}

const CURRENCIES = ['MXN', 'USD'] as const;

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const toCents = (amount: string) => Math.round(Number(amount) * 100);
const toMoney = (cents: number) => (cents / 100).toFixed(2);

/**
 * Cartera por vencimiento (AC-010-03): vencido, ≤ 7 días, del día 8 al horizonte y después. Los tres primeros salen
 * de `items` (vencidos + próximos del horizonte); "después" es lo por pagar que queda. Cada moneda por separado.
 */
export function dueBuckets(data: DashboardDto): DueBucket[] {
  const week = addDays(data.today, 7);
  const cents = {
    overdue: { MXN: 0, USD: 0, count: 0 },
    week: { MXN: 0, USD: 0, count: 0 },
    horizon: { MXN: 0, USD: 0, count: 0 },
  };
  for (const item of data.items) {
    const key = item.overdue ? 'overdue' : item.dueOn <= week ? 'week' : 'horizon';
    cents[key][item.currency] += toCents(item.total);
    cents[key].count += 1;
  }
  const known = (['overdue', 'week', 'horizon'] as const).map((key) => cents[key]);
  const later = {
    MXN: toCents(data.totals.pending.amount.MXN) - known.reduce((sum, b) => sum + b.MXN, 0),
    USD: toCents(data.totals.pending.amount.USD) - known.reduce((sum, b) => sum + b.USD, 0),
    count: data.totals.pending.count - known.reduce((sum, b) => sum + b.count, 0),
  };
  const labels: Record<DueBucketKey, string> = {
    overdue: 'Vencido',
    week: '≤ 7 días',
    horizon: `8–${data.horizon} días`,
    later: `Después de ${data.horizon} días`,
  };
  const all = { ...cents, later };
  return (['overdue', 'week', 'horizon', 'later'] as const)
    .filter((key) => key !== 'horizon' || data.horizon > 7)
    .map((key) => ({
      key,
      label: labels[key],
      count: all[key].count,
      amount: { MXN: toMoney(all[key].MXN), USD: toMoney(all[key].USD) },
    }));
}

/** Monedas con algo por pagar, para dibujar una barra por moneda. */
export function currenciesIn(buckets: DueBucket[]) {
  return CURRENCIES.filter((c) => buckets.some((b) => Number(b.amount[c]) > 0));
}

/** Fracción (0–1) de cada día de pago respecto al día más grande, en su moneda más fuerte. */
export function payDayShare(days: DashboardDto['byPayDay']): number[] {
  const max = Object.fromEntries(
    CURRENCIES.map((c) => [c, Math.max(0, ...days.map((d) => Number(d.amount[c])))]),
  ) as Record<(typeof CURRENCIES)[number], number>;
  return days.map((d) =>
    Math.max(...CURRENCIES.map((c) => (max[c] > 0 ? Number(d.amount[c]) / max[c] : 0))),
  );
}

import {
  UNCLASSIFIED_LINE,
  type KioskReportDto,
  type KioskRowDto,
} from '@mimark/contracts/reports';
import { centsToMoney } from '../../common/money.js';
import {
  indexCategories,
  lineOf,
  percent,
  reportAmount,
  isIncomeLine,
  COMMISSION_LINES,
  type ReportCategory,
  type ReportEntry,
} from './reports.rules.js';

export interface ReportKiosk {
  id: string;
  name: string;
}

const NO_KIOSK = 'Sin kiosko';

/** Ventas y rentabilidad por kiosko; los gastos generales no se prorratean (AC-024-09 a 11). */
export function kioskRows(
  entries: readonly ReportEntry[],
  categories: readonly ReportCategory[],
  kiosks: readonly ReportKiosk[],
): Pick<KioskReportDto, 'rows' | 'overhead' | 'unclassified' | 'totals'> {
  const index = indexCategories(categories);
  type Acc = {
    sales: number;
    cost: number;
    waste: number;
    theft: number;
    commissions: number;
    seen: boolean;
  };
  const blank = (): Acc => ({ sales: 0, cost: 0, waste: 0, theft: 0, commissions: 0, seen: false });
  const byKiosk = new Map<string | null, Acc>();
  let overhead = 0;
  let unclassified = 0;

  for (const entry of entries) {
    const line = lineOf(entry, index);
    if (line === null) continue;
    const amount = reportAmount(line, entry.cents);
    if (line === UNCLASSIFIED_LINE) {
      unclassified += amount;
      continue;
    }
    const attributable =
      isIncomeLine(line) ||
      line === 'Costo de lo vendido' ||
      line === 'Mermas' ||
      line === 'Robos' ||
      COMMISSION_LINES.includes(line);
    if (!attributable) {
      overhead += amount;
      continue;
    }
    const acc = byKiosk.get(entry.kioskId) ?? blank();
    acc.seen = true;
    if (isIncomeLine(line)) acc.sales += amount;
    else if (line === 'Costo de lo vendido') acc.cost += amount;
    else if (line === 'Mermas') acc.waste += amount;
    else if (line === 'Robos') acc.theft += amount;
    else acc.commissions += amount;
    byKiosk.set(entry.kioskId, acc);
  }

  const names = new Map(kiosks.map((k) => [k.id, k.name]));
  const toRow = (kioskId: string | null, name: string, a: Acc): KioskRowDto => {
    const margin = a.sales - a.cost;
    return {
      kioskId,
      name,
      sales: centsToMoney(a.sales),
      cost: centsToMoney(a.cost),
      margin: centsToMoney(margin),
      marginPercent: percent(margin, a.sales),
      waste: centsToMoney(a.waste),
      theft: centsToMoney(a.theft),
      commissions: centsToMoney(a.commissions),
      profitBeforeOverhead: centsToMoney(margin - a.waste - a.theft - a.commissions),
      negativeMargin: margin < 0,
    };
  };

  const named = [...byKiosk.entries()]
    .filter(([id]) => id !== null)
    .map(([id, acc]) => ({ id: id as string, acc }))
    .sort((a, b) => (names.get(a.id) ?? a.id).localeCompare(names.get(b.id) ?? b.id, 'es'))
    .map(({ id, acc }) => toRow(id, names.get(id) ?? 'Kiosko desconocido', acc));
  const none = byKiosk.get(null);
  const rows = [...named, ...(none ? [toRow(null, NO_KIOSK, none)] : [])];

  const sum = (pick: (a: Acc) => number) =>
    [...byKiosk.values()].reduce((acc, a) => acc + pick(a), 0);
  const sales = sum((a) => a.sales);
  const cost = sum((a) => a.cost);
  const waste = sum((a) => a.waste);
  const theft = sum((a) => a.theft);
  const commissions = sum((a) => a.commissions);
  const margin = sales - cost;
  return {
    rows,
    overhead: centsToMoney(overhead),
    unclassified: centsToMoney(unclassified),
    totals: {
      sales: centsToMoney(sales),
      cost: centsToMoney(cost),
      margin: centsToMoney(margin),
      waste: centsToMoney(waste),
      theft: centsToMoney(theft),
      commissions: centsToMoney(commissions),
      profitBeforeOverhead: centsToMoney(margin - waste - theft - commissions),
    },
  };
}

import type { SupplierRowDto } from '@mimark/contracts/reports';
import { centsToMoney } from '../../common/money.js';
import { matchRule } from '../closing/closing.rules.js';
import {
  SUPPLIER_CATEGORY,
  indexCategories,
  lineOf,
  percent,
  type ReportCategory,
  type ReportEntry,
} from './reports.rules.js';

export interface SupplierRule {
  id: string;
  pattern: string;
  patternKey: string;
  priority: number;
  active: boolean;
  categoryId: string;
}

/**
 * Pagos por proveedor (AC-024-12 y 13): el proveedor es el patrón de la regla de «Costo de lo vendido» que
 * coincide con el concepto; los egresos que ninguna regla cubre no aparecen.
 */
export function supplierRows(
  entries: readonly ReportEntry[],
  categories: readonly ReportCategory[],
  rules: readonly SupplierRule[],
): { rows: SupplierRowDto[]; totalSpend: string } {
  const index = indexCategories(categories);
  const groups = new Map<
    string,
    { name: string; total: number; count: number; first: string; last: string }
  >();
  for (const entry of entries) {
    if (lineOf(entry, index) === null || entry.cents >= 0 || !entry.categoryId) continue;
    const category = index.get(entry.categoryId);
    if (category?.code !== SUPPLIER_CATEGORY) continue;
    const rule = matchRule(
      entry.concept,
      rules.filter((r) => r.categoryId === entry.categoryId),
    );
    if (!rule) continue;
    const g = groups.get(rule.id) ?? {
      name: rule.pattern,
      total: 0,
      count: 0,
      first: entry.date,
      last: entry.date,
    };
    g.total += -entry.cents;
    g.count += 1;
    if (entry.date < g.first) g.first = entry.date;
    if (entry.date > g.last) g.last = entry.date;
    groups.set(rule.id, g);
  }
  const all = [...groups.values()];
  const totalSpend = all.reduce((acc, g) => acc + g.total, 0);
  const rows = all
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
    .map((g) => ({
      name: g.name,
      total: centsToMoney(g.total),
      count: g.count,
      average: centsToMoney(Math.round(g.total / g.count)),
      percentOfSpend: percent(g.total, totalSpend) ?? '0.00',
      firstPaymentOn: g.first,
      lastPaymentOn: g.last,
    }));
  return { rows, totalSpend: centsToMoney(totalSpend) };
}

import type { EdoResLine } from '@mimark/contracts/closing';
import {
  UNCLASSIFIED_LINE,
  type DrillCategoryDto,
  type EdoResRowDto,
  type ReportLine,
  type ReportStatus,
} from '@mimark/contracts/reports';
import { centsToMoney } from '../../common/money.js';
import { signedMoneyToCents } from '../closing/closing-checks.rules.js';

/** Decisiones puras de los reportes del cierre (spec 024): sin I/O, sin reloj. Todo se suma en centavos. */

/** Composición del EDO RES (aprobada 2026-11-19; ver la spec 024). */
export const NET_SALES_LINES = ['Ventas', 'Venta directa', 'Otros ingresos'] as const;
export const COST_LINES = ['Costo de lo vendido', 'Mermas', 'Robos'] as const;
export const OPERATING_LINES = [
  'Rentas',
  'Nóminas',
  'Gasolina',
  'Fee Cantaloupe',
  'Fee Nayax',
  'Telemetría',
  'Fee software',
  'Teléfono, internet, luz y agua',
  'Seguridad y vigilancia',
  'Papelería y MKT',
  'Fumigación',
  'Tarjetas de crédito',
  'Créditos',
  'Comisión bancaria',
  'Intereses',
] as const satisfies readonly EdoResLine[];
export const COMMISSION_LINES: readonly EdoResLine[] = [
  'Fee Cantaloupe',
  'Fee Nayax',
  'Fee software',
];
/** Renglones que no son de operación y que, por ahora, restan de la utilidad neta. */
const BELOW_LINES = ['Impuestos', 'Inversiones', 'No deducibles'] as const;

/** El depósito de Cantaloupe cobra ventas ya contadas (spec 023): nunca es ingreso. */
const EXCLUDED_CATEGORY = 'COBRANZA_CANTALOUPE';
export const SUPPLIER_CATEGORY = 'COSTO_VENDIDO';

export interface ReportCategory {
  id: string;
  code: string;
  name: string;
  edoResLine: EdoResLine;
  sortOrder: number;
}

export interface ReportEntry {
  id: string;
  /** Número de fila del archivo de origen; `null` en capturas manuales. */
  rowNumber: number | null;
  date: string;
  source: string;
  kind: 'normal' | 'internal_transfer';
  categoryId: string | null;
  needsReview: boolean;
  kioskId: string | null;
  concept: string;
  /** Con signo: ingreso +, egreso −. */
  cents: number;
}

type CategoryIndex = ReadonlyMap<string, ReportCategory>;

export const indexCategories = (categories: readonly ReportCategory[]): CategoryIndex =>
  new Map(categories.map((c) => [c.id, c]));

/**
 * El renglón donde cae un movimiento; `null` si no entra a ningún reporte (traspasos, la fuente
 * `cantaloupe`, que solo concilia, y la cobranza de Cantaloupe).
 */
export function lineOf(entry: ReportEntry, categories: CategoryIndex): ReportLine | null {
  if (entry.kind === 'internal_transfer' || entry.source === 'cantaloupe') return null;
  if (!entry.categoryId) return UNCLASSIFIED_LINE;
  const category = categories.get(entry.categoryId);
  if (!category) return UNCLASSIFIED_LINE;
  return category.code === EXCLUDED_CATEGORY ? null : category.edoResLine;
}

export const isIncomeLine = (line: ReportLine) =>
  (NET_SALES_LINES as readonly string[]).includes(line);

/** Ingresos con su signo; costos y gastos como magnitud positiva; «Por clasificar» con el signo crudo. */
export function reportAmount(line: ReportLine, cents: number): number {
  return isIncomeLine(line) || line === UNCLASSIFIED_LINE ? cents : -cents;
}

/** El periodo cerrado es final; abierto es siempre provisional, aunque ya esté todo clasificado. */
export function reportStatus(entryCount: number, closed: boolean): ReportStatus {
  if (entryCount === 0) return 'empty';
  return closed ? 'final' : 'provisional';
}

/** Porcentaje con 2 decimales, redondeado half-up en valor absoluto; `null` si la base es 0. */
export function percent(part: number, whole: number): string | null {
  if (whole === 0) return null;
  const scaled = Math.round((Math.abs(part) * 10000) / Math.abs(whole));
  const value = (Math.sign(part) * Math.sign(whole) * scaled) / 100;
  return (Object.is(value, -0) ? 0 : value).toFixed(2);
}

function sumByLine(entries: readonly ReportEntry[], categories: CategoryIndex) {
  const byLine = new Map<ReportLine, number>();
  let counted = 0;
  for (const entry of entries) {
    const line = lineOf(entry, categories);
    if (line === null) continue;
    counted += 1;
    byLine.set(line, (byLine.get(line) ?? 0) + reportAmount(line, entry.cents));
  }
  return { byLine, counted };
}

const total = (byLine: ReadonlyMap<ReportLine, number>, lines: readonly ReportLine[]) =>
  lines.reduce((acc, line) => acc + (byLine.get(line) ?? 0), 0);

/** Los renglones del EDO RES en orden, con importe (centavos) listo para `withPercent`. */
export function buildEdoRes(
  entries: readonly ReportEntry[],
  categories: readonly ReportCategory[],
): { rows: EdoResRowDto[]; counted: number } {
  const { byLine, counted } = sumByLine(entries, indexCategories(categories));
  const get = (line: ReportLine) => byLine.get(line) ?? 0;

  const netSales = total(byLine, NET_SALES_LINES);
  const cost = total(byLine, COST_LINES);
  const grossProfit = netSales - cost;
  const operating = total(byLine, OPERATING_LINES);
  const below = total(byLine, BELOW_LINES);
  const unclassified = get(UNCLASSIFIED_LINE);
  const netProfit = grossProfit - operating - below + unclassified;

  const row = (
    key: string,
    label: string,
    kind: EdoResRowDto['kind'],
    line: ReportLine | null,
    cents: number,
  ): EdoResRowDto => ({
    key,
    label,
    kind,
    line,
    amount: centsToMoney(cents),
    percentOfSales: percent(cents, netSales),
  });
  // Dentro de cada grupo, el orden lo da el `sortOrder` de las categorías del catálogo (desempata el orden fijo).
  const rank = new Map<EdoResLine, number>();
  for (const c of categories) {
    rank.set(c.edoResLine, Math.min(rank.get(c.edoResLine) ?? Infinity, c.sortOrder));
  }
  const leaves = (lines: readonly EdoResLine[]) =>
    [...lines]
      .sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity))
      .map((line) => row(line, line, 'line', line, get(line)));

  const rows = [
    ...leaves(NET_SALES_LINES),
    row('net_sales', 'Ventas netas', 'subtotal', null, netSales),
    ...leaves(COST_LINES),
    row('cost', 'Costo de lo vendido (total)', 'subtotal', null, cost),
    row('gross_profit', 'Utilidad bruta', 'subtotal', null, grossProfit),
    ...leaves(OPERATING_LINES),
    row('operating_expenses', 'Gastos de operación', 'subtotal', null, operating),
    ...leaves(BELOW_LINES),
    ...(byLine.has(UNCLASSIFIED_LINE)
      ? [row('unclassified', UNCLASSIFIED_LINE, 'line', UNCLASSIFIED_LINE, unclassified)]
      : []),
    row('net_profit', 'Utilidad neta', 'total', null, netProfit),
  ];
  return { rows, counted };
}

/** Agrega `previousAmount` y `delta` (en centavos exactos) a cada renglón, emparejando por `key`. */
export function withComparison(
  rows: readonly EdoResRowDto[],
  previous: readonly EdoResRowDto[],
): EdoResRowDto[] {
  const before = new Map(previous.map((r) => [r.key, r.amount]));
  return rows.map((r) => {
    const prev = before.get(r.key) ?? '0.00';
    return {
      ...r,
      previousAmount: prev,
      delta: centsToMoney(signedMoneyToCents(r.amount) - signedMoneyToCents(prev)),
    };
  });
}

export interface DrillResult<E extends ReportEntry> {
  amount: string;
  categories: DrillCategoryDto[];
  /** Movimientos del renglón por fecha y fila, con el signo del renglón. */
  entries: (E & { amountCents: number; categoryCode: string | null })[];
}

/** Los movimientos que forman un renglón y su subtotal por categoría (AC-024-06 y 08). */
export function drillLine<E extends ReportEntry>(
  line: ReportLine,
  entries: readonly E[],
  categories: readonly ReportCategory[],
): DrillResult<E> {
  const index = indexCategories(categories);
  const mine = entries
    .filter((e) => lineOf(e, index) === line)
    .map((e) => ({
      ...e,
      amountCents: reportAmount(line, e.cents),
      categoryCode: (e.categoryId && index.get(e.categoryId)?.code) || null,
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.rowNumber ?? 0) - (b.rowNumber ?? 0) ||
        a.id.localeCompare(b.id),
    );

  const byCategory = new Map<string, DrillCategoryDto & { cents: number }>();
  for (const e of mine) {
    const code = e.categoryCode ?? '';
    const cat = (e.categoryId && index.get(e.categoryId)) || null;
    const current = byCategory.get(code) ?? {
      code,
      name: cat?.name ?? UNCLASSIFIED_LINE,
      amount: '0.00',
      count: 0,
      cents: 0,
    };
    current.cents += e.amountCents;
    current.count += 1;
    current.amount = centsToMoney(current.cents);
    byCategory.set(code, current);
  }
  const categoriesOut = [...byCategory.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(({ code, name, amount, count }) => ({ code, name, amount, count }));
  const amount = mine.reduce((acc, e) => acc + e.amountCents, 0);
  return { amount: centsToMoney(amount), categories: categoriesOut, entries: mine };
}

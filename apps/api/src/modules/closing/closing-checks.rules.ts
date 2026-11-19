import type { CheckDto, CheckStatus } from '@mimark/contracts/closing-review';
import type { Source } from '@mimark/contracts/closing-uploads';
import type { LocalDate } from '@mimark/contracts/common';
import { diffDays, weekdaysBetween } from '../../common/dates.js';
import { centsToMoney } from '../../common/money.js';

/** Clasificación por fuente, traspasos y cuadres del cierre (spec 023): puras, todo en centavos. */

const BANK_SOURCES: readonly Source[] = ['bank_csv', 'bank_pdf'];
export const isBankSource = (source: Source) => BANK_SOURCES.includes(source);

/** Códigos de categoría que el sistema usa por nombre (catálogo de 020, `closing.catalog.ts`). */
export const SALES_CODE = 'VENTAS';
export const PAYROLL_CODE = 'NOMINAS';
export const CANTALOUPE_COLLECTION_CODE = 'COBRANZA_CANTALOUPE';

/**
 * Categoría fija de las fuentes que no traen un concepto que clasificar (AC-023-01). `null` = va por reglas, o no
 * lleva categoría (Cantaloupe solo concilia: la venta del reporte sale de Parlevel).
 */
export function categoryForSource(entry: {
  source: Source;
  meta: Record<string, unknown> | null;
}): string | null {
  switch (entry.source) {
    case 'parlevel_sales':
      return SALES_CODE;
    case 'parlevel_waste':
      return entry.meta?.kind === 'theft' ? 'ROBOS' : 'MERMAS';
    case 'payroll':
      return PAYROLL_CODE;
    default:
      return null;
  }
}

/** Fuentes que se clasifican por reglas y pasan por la cola «Por revisar». */
export const isRuleSource = (source: Source) =>
  source === 'cash' || source === 'bank_csv' || source === 'bank_pdf';

// Traspasos
export interface TransferEntry {
  id: string;
  date: LocalDate;
  source: Source;
  accountId: string | null;
  amountCents: number;
  rowNumber: number | null;
}

export interface TransferOptions {
  businessDays: readonly number[];
  /** Diferencia máxima entre las fechas, en días hábiles (AC-023-06). */
  maxBusinessDays: number;
}

/** ¿Estos dos movimientos pueden ser los dos lados de un traspaso? */
export function canPair(a: TransferEntry, b: TransferEntry, opts: TransferOptions): boolean {
  return (
    a.id !== b.id &&
    isBankSource(a.source) &&
    isBankSource(b.source) &&
    a.accountId !== null &&
    b.accountId !== null &&
    a.accountId !== b.accountId &&
    a.amountCents !== 0 &&
    a.amountCents === -b.amountCents &&
    weekdaysBetween(a.date, b.date, opts.businessDays) <= opts.maxBusinessDays
  );
}

/**
 * Pares que parecen un traspaso entre cuentas propias (AC-023-06). Determinista: cada egreso, en orden de fecha y
 * fila, toma el ingreso libre más cercano en fecha (a igual distancia, el más antiguo y luego el de menor id).
 */
export function proposeTransfers(
  entries: readonly TransferEntry[],
  opts: TransferOptions,
): [string, string][] {
  const order = (x: TransferEntry, y: TransferEntry) =>
    x.date.localeCompare(y.date) ||
    (x.rowNumber ?? 0) - (y.rowNumber ?? 0) ||
    x.id.localeCompare(y.id);
  const outflows = entries.filter((e) => e.amountCents < 0).sort(order);
  const inflows = entries.filter((e) => e.amountCents > 0).sort(order);
  const used = new Set<string>();
  const pairs: [string, string][] = [];
  for (const out of outflows) {
    let best: TransferEntry | null = null;
    let bestDistance = Infinity;
    for (const inflow of inflows) {
      if (used.has(inflow.id) || !canPair(out, inflow, opts)) continue;
      const distance = Math.abs(diffDays(out.date, inflow.date));
      if (distance < bestDistance) {
        best = inflow;
        bestDistance = distance;
      }
    }
    if (best) {
      used.add(best.id);
      pairs.push([out.id, best.id]);
    }
  }
  return pairs;
}

// Cuadres
export interface CheckEntry {
  id: string;
  accountId: string | null;
  source: Source;
  amountCents: number;
  categoryCode: string | null;
  kind: 'normal' | 'internal_transfer';
  uploadId: string | null;
  rowNumber: number | null;
}

export interface BankStatement {
  accountId: string;
  openingCents: number;
  closingCents: number;
}

export interface ChecksInput {
  entries: readonly CheckEntry[];
  accounts: readonly { id: string; name: string }[];
  /** Estado de cuenta confirmado de cada cuenta (spec 022), si lo hay. */
  statements: readonly BankStatement[];
}

const MAX_LINKED_ENTRIES = 50;
const sum = (rows: readonly { amountCents: number }[]) =>
  rows.reduce((total, row) => total + row.amountCents, 0);
const ids = (rows: readonly { id: string }[]) => rows.slice(0, MAX_LINKED_ENTRIES).map((r) => r.id);
const money = (cents: number) => centsToMoney(cents);

function check(
  id: string,
  title: string,
  status: CheckStatus,
  a: number,
  b: number,
  message: string,
  entryIds: string[] = [],
): CheckDto {
  return {
    id,
    title,
    status,
    valueA: money(a),
    valueB: money(b),
    difference: money(a - b),
    message,
    entryIds,
  };
}

/** Los seis cuadres del cierre (AC-023-12 y 13). */
export function runChecks(input: ChecksInput): CheckDto[] {
  const { entries } = input;
  const bank = entries.filter((e) => isBankSource(e.source));
  const checks: CheckDto[] = [];

  // (a) Ventas de Parlevel = ventas del reporte.
  const parlevel = entries.filter((e) => e.source === 'parlevel_sales');
  const reported = entries.filter((e) => e.categoryCode === SALES_CODE);
  const salesA = sum(parlevel);
  const salesB = sum(reported);
  const salesOk = salesA === salesB;
  checks.push(
    check(
      'sales',
      'Ventas de Parlevel contra ventas del reporte',
      salesOk ? 'ok' : 'error',
      salesA,
      salesB,
      salesOk
        ? 'Las ventas del reporte son las mismas que las de Parlevel.'
        : 'Las ventas del reporte no coinciden con las de Parlevel: hay ventas sin categoría «Ventas» o movimientos de otra fuente en esa categoría.',
      salesOk
        ? []
        : ids([
            ...parlevel.filter((e) => e.categoryCode !== SALES_CODE),
            ...reported.filter((e) => e.source !== 'parlevel_sales'),
          ]),
    ),
  );

  // (b) Saldo inicial + movimientos = saldo final, por cuenta.
  const accountIds = new Set([
    ...bank.map((e) => e.accountId),
    ...input.statements.map((s) => s.accountId),
  ]);
  for (const account of input.accounts.filter((a) => accountIds.has(a.id))) {
    const own = bank.filter((e) => e.accountId === account.id);
    const statement = input.statements.find((s) => s.accountId === account.id);
    const title = `Saldos de ${account.name}`;
    if (!statement) {
      checks.push(
        check(
          `bank_balance:${account.id}`,
          title,
          'warning',
          sum(own),
          sum(own),
          'No hay un estado de cuenta en PDF confirmado de esta cuenta: no se pueden comprobar sus saldos.',
        ),
      );
      continue;
    }
    const expectedClosing = statement.openingCents + sum(own);
    const ok = expectedClosing === statement.closingCents;
    checks.push(
      check(
        `bank_balance:${account.id}`,
        title,
        ok ? 'ok' : 'error',
        expectedClosing,
        statement.closingCents,
        ok
          ? 'El saldo inicial más los movimientos da el saldo final del estado de cuenta.'
          : 'El saldo inicial más los movimientos no da el saldo final del estado de cuenta: faltan o sobran movimientos.',
        ok ? [] : ids(own),
      ),
    );
  }

  // (c) Movimiento neto de bancos por dos caminos; los traspasos deben sumar cero.
  const transfers = bank.filter((e) => e.kind === 'internal_transfer');
  const categorized = bank.filter((e) => e.kind === 'normal' && e.categoryCode !== null);
  const loose = bank.filter((e) => e.kind === 'normal' && e.categoryCode === null);
  // Camino A: todo lo que movió el banco. Camino B: lo que el reporte alcanza a explicar (categorías y traspasos).
  const pathA = sum(bank);
  const pathB = sum(categorized) + sum(transfers);
  const netTransfers = sum(transfers);
  const netOk = pathA === pathB && netTransfers === 0;
  checks.push(
    check(
      'bank_net',
      'Movimiento neto de los bancos',
      netOk ? 'ok' : 'error',
      pathA,
      pathB,
      netOk
        ? 'Todo el movimiento de los bancos está en alguna categoría o traspaso, y los traspasos suman cero.'
        : netTransfers !== 0
          ? 'Los traspasos no suman cero: falta o sobra uno de los lados.'
          : 'Hay movimientos de banco sin categoría que no entran en el reporte.',
      netOk ? [] : ids(netTransfers !== 0 ? transfers : loose),
    ),
  );

  // (d) Nómina capturada = nómina en egresos.
  const payroll = entries.filter((e) => e.source === 'payroll');
  const payrollReported = entries.filter((e) => e.categoryCode === PAYROLL_CODE);
  const payrollOk = sum(payroll) === sum(payrollReported);
  checks.push(
    check(
      'payroll',
      'Nómina capturada contra nómina del reporte',
      payrollOk ? 'ok' : 'error',
      sum(payroll),
      sum(payrollReported),
      payrollOk
        ? 'La nómina del reporte es la que se capturó.'
        : 'La nómina del reporte no coincide con la capturada.',
      payrollOk
        ? []
        : ids([
            ...payroll.filter((e) => e.categoryCode !== PAYROLL_CODE),
            ...payrollReported.filter((e) => e.source !== 'payroll'),
          ]),
    ),
  );

  // (e) Ningún egreso sin categoría.
  const uncategorized = entries.filter(
    (e) =>
      e.amountCents < 0 &&
      e.kind === 'normal' &&
      e.source !== 'cantaloupe' &&
      e.categoryCode === null,
  );
  checks.push(
    check(
      'uncategorized',
      'Egresos sin categoría',
      uncategorized.length === 0 ? 'ok' : 'error',
      sum(uncategorized),
      0,
      uncategorized.length === 0
        ? 'Todos los egresos tienen categoría.'
        : `Hay ${uncategorized.length} egreso(s) sin categoría.`,
      ids(uncategorized),
    ),
  );

  // (f) Ningún movimiento contado dos veces (mismo archivo y fila).
  const seen = new Map<string, CheckEntry[]>();
  for (const e of entries) {
    if (e.uploadId === null || e.rowNumber === null) continue;
    const key = `${e.uploadId}#${e.rowNumber}`;
    seen.set(key, [...(seen.get(key) ?? []), e]);
  }
  const duplicated = [...seen.values()].filter((rows) => rows.length > 1).flat();
  checks.push({
    id: 'duplicates',
    title: 'Movimientos contados dos veces',
    status: duplicated.length === 0 ? 'ok' : 'error',
    valueA: String(duplicated.length),
    valueB: '0',
    difference: String(duplicated.length),
    message:
      duplicated.length === 0
        ? 'Ningún movimiento aparece dos veces.'
        : `Hay ${duplicated.length} movimientos repetidos del mismo archivo y fila.`,
    entryIds: ids(duplicated),
  });

  return checks;
}

/** Cerrar exige cero cuadres en error y cero movimientos por revisar (AC-023-14). */
export function canClose(checks: readonly CheckDto[], pendingReview: number) {
  const errors = checks.filter((c) => c.status === 'error');
  return { allowed: errors.length === 0 && pendingReview === 0, errors, pendingReview };
}

/** «-1234.50» → -123450. */
export function signedMoneyToCents(value: string): number {
  const negative = value.trim().startsWith('-');
  const [whole = '0', fraction = ''] = value.trim().replace(/^-/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -cents : cents;
}

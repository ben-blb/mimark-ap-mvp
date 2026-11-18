import type { Source } from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import { centsToMoney } from '../../common/money.js';
import { normalizeKey } from './closing.rules.js';
import { SOURCE_FORMATS } from './source-formats.js';
import { cellText, parseAmountCents, parseDate } from './source-values.rules.js';

/**
 * Lectura de las fuentes del mes (spec 021): de filas ya leídas (`unknown[][]`) a movimientos. Puras: la lectura física
 * del `.xlsx`/CSV vive en `integrations/spreadsheet.client.ts`.
 */

/** Kioskos del catálogo de la empresa, por su identificador en cada fuente (llaves con `normalizeKey`). */
export interface KioskLookup {
  byAsset: Map<string, string>;
  byDevice: Map<string, string>;
}

export interface RowContext {
  /** Campo → posición de la columna en la hoja (de `detectColumns`). */
  columns: Record<string, number>;
  kiosks: KioskLookup;
}

export interface ParsedEntry {
  date: string;
  kioskId: string | null;
  concept: string;
  /** Con signo: ingreso +, egreso −. */
  amount: string;
  needsReview: boolean;
  flags: string[];
  meta: Record<string, unknown> | null;
}
export type RowResult = { entry: ParsedEntry } | { reject: string };

export function detectColumns(
  source: Source,
  header: unknown[],
): { columns: Record<string, number>; missing: string[] } {
  const keys = header.map((cell) => normalizeKey(cellText(cell)));
  const columns: Record<string, number> = {};
  const missing: string[] = [];
  for (const [field, def] of Object.entries(SOURCE_FORMATS[source])) {
    const index = keys.findIndex((key) => def.names.includes(key));
    if (index >= 0) columns[field] = index;
    else if (def.required) missing.push(def.label);
  }
  return { columns, missing };
}

const reject = (reason: string): RowResult => ({ reject: reason });

/** Una fila → un movimiento, o el motivo por el que no se puede leer. */
export function normalizeRow(source: Source, row: unknown[], ctx: RowContext): RowResult {
  const get = (field: string): unknown => {
    const index = ctx.columns[field];
    return index === undefined ? undefined : row[index];
  };
  const text = (field: string) => cellText(get(field));

  const date = parseDate(get('date'));
  if (!date) return reject('Fecha inválida');

  switch (source) {
    case 'parlevel_sales': {
      const sales = parseAmountCents(get('sales'));
      if (sales === null) return reject('Importe inválido');
      const kiosk = resolveKiosk(text('asset'), ctx.kiosks.byAsset, 'Asset');
      if ('reject' in kiosk) return reject(kiosk.reject);
      return entry(date, kiosk, 'Ventas', sales, {
        commission: moneyMeta(get('commission')),
        cost: moneyMeta(get('cost')),
      });
    }
    case 'parlevel_waste': {
      const amount = parseAmountCents(get('amount'));
      if (amount === null) return reject('Importe inválido');
      const type = text('type');
      const kind = WASTE_KINDS[normalizeKey(type)];
      if (!kind) return reject(`Tipo desconocido: ${type}`);
      const kiosk = resolveKiosk(text('asset'), ctx.kiosks.byAsset, 'Asset');
      if ('reject' in kiosk) return reject(kiosk.reject);
      return entry(date, kiosk, kind.label, -Math.abs(amount), { kind: kind.kind });
    }
    case 'cantaloupe': {
      const amount = parseAmountCents(get('amount'));
      if (amount === null) return reject('Importe inválido');
      const kiosk = resolveKiosk(text('device'), ctx.kiosks.byDevice, 'Device ID');
      if ('reject' in kiosk) return reject(kiosk.reject);
      const transactions = Number(text('transactions'));
      return entry(date, kiosk, 'Ventas Cantaloupe', amount, {
        transactions:
          text('transactions') !== '' && Number.isFinite(transactions) ? transactions : null,
        discountRate: text('discountRate') || null,
        vat: moneyMeta(get('vat')),
      });
    }
    case 'bank_csv': {
      const withdrawals = optionalCents(get('withdrawals'));
      const deposits = optionalCents(get('deposits'));
      if (withdrawals === 'invalid' || deposits === 'invalid') return reject('Importe inválido');
      if (withdrawals === null && deposits === null) return reject('Falta el importe');
      const net = Math.abs(deposits ?? 0) - Math.abs(withdrawals ?? 0);
      return entry(date, { id: null, flags: [] }, text('concept'), net, {});
    }
    case 'cash': {
      const amount = parseAmountCents(get('amount'));
      if (amount === null) return reject('Importe inválido');
      const kind = text('kind');
      const direction = CASH_DIRECTIONS[normalizeKey(kind)];
      if (!direction) return reject(`Tipo desconocido: ${kind} (usa Entrada o Salida)`);
      return entry(
        date,
        { id: null, flags: [] },
        text('concept'),
        direction * Math.abs(amount),
        {},
      );
    }
    case 'payroll': {
      const amount = parseAmountCents(get('amount'));
      if (amount === null) return reject('Importe inválido');
      const name = text('name');
      if (!name) return reject('Falta el nombre');
      const imss = ctx.columns.imss === undefined ? null : YES.has(normalizeKey(text('imss')));
      return entry(date, { id: null, flags: [] }, name, -Math.abs(amount), { imss });
    }
  }
}

const WASTE_KINDS: Record<string, { kind: 'waste' | 'theft'; label: string }> = {
  merma: { kind: 'waste', label: 'Merma' },
  waste: { kind: 'waste', label: 'Merma' },
  robo: { kind: 'theft', label: 'Robo' },
  theft: { kind: 'theft', label: 'Robo' },
};
const CASH_DIRECTIONS: Record<string, 1 | -1> = { entrada: 1, in: 1, salida: -1, out: -1 };
const YES = new Set(['si', 'x', '1', 'true', 'yes']);

type KioskRef = { id: string | null; flags: string[] };

function resolveKiosk(
  raw: string,
  lookup: Map<string, string>,
  label: string,
): KioskRef | { reject: string } {
  if (!raw) return { reject: `Falta el ${label}` };
  const id = lookup.get(normalizeKey(raw));
  return id ? { id, flags: [] } : { id: null, flags: [`UNKNOWN_KIOSK:${raw}`] };
}

function entry(
  date: string,
  kiosk: KioskRef,
  concept: string,
  cents: number,
  meta: Record<string, unknown>,
): RowResult {
  const present = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== null && v !== undefined),
  );
  return {
    entry: {
      date,
      kioskId: kiosk.id,
      concept,
      amount: centsToMoney(cents),
      needsReview: kiosk.flags.length > 0,
      flags: kiosk.flags,
      meta: Object.keys(present).length > 0 ? present : null,
    },
  };
}

/** Un importe opcional: vacío → `null`; ilegible → 'invalid'. */
function optionalCents(value: unknown): number | null | 'invalid' {
  if (cellText(value) === '') return null;
  return parseAmountCents(value) ?? 'invalid';
}

function moneyMeta(value: unknown): string | null {
  const cents = cellText(value) === '' ? null : parseAmountCents(value);
  return cents === null ? null : centsToMoney(cents);
}

/** El mes ('AAAA-MM') en el que caen más fechas, o `null` sin fechas. */
export function monthOf(dates: string[]): string | null {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d.slice(0, 7), (counts.get(d.slice(0, 7)) ?? 0) + 1);
  let best: string | null = null;
  for (const [month, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = month;
  return best;
}

export interface SheetAnalysis {
  rowsRead: number;
  rejected: { row: number; reason: string }[];
  /** Con el número de fila de la hoja (la cabecera suele ser la 1). */
  entries: { row: number; entry: ParsedEntry }[];
}

const isBlank = (row: unknown[]) => row.every((cell) => cellText(cell) === '');

/**
 * Valida y normaliza una hoja completa: columnas obligatorias, filas legibles y que todas las fechas sean del mes
 * del periodo. Lanza `SOURCE_MISSING_COLUMNS` o `SOURCE_WRONG_MONTH`; las filas sueltas malas solo se rechazan.
 */
export function analyzeSheet(
  source: Source,
  rows: unknown[][],
  opts: { month: string; kiosks: KioskLookup },
): SheetAnalysis {
  const headerIndex = rows.findIndex((row) => !isBlank(row));
  const { columns, missing } = detectColumns(
    source,
    headerIndex < 0 ? [] : (rows[headerIndex] ?? []),
  );
  if (headerIndex < 0 || missing.length > 0) {
    const labels =
      headerIndex < 0
        ? Object.values(SOURCE_FORMATS[source])
            .filter((d) => d.required)
            .map((d) => d.label)
        : missing;
    throw new AppError(
      'SOURCE_MISSING_COLUMNS',
      `Al archivo le faltan columnas: ${labels.join(', ')}.`,
      {
        details: { missing: labels },
      },
    );
  }

  const result: SheetAnalysis = { rowsRead: 0, rejected: [], entries: [] };
  rows.slice(headerIndex + 1).forEach((row, i) => {
    if (isBlank(row)) return;
    const rowNumber = headerIndex + i + 2;
    result.rowsRead += 1;
    const parsed = normalizeRow(source, row, { columns, kiosks: opts.kiosks });
    if ('reject' in parsed) result.rejected.push({ row: rowNumber, reason: parsed.reject });
    else result.entries.push({ row: rowNumber, entry: parsed.entry });
  });

  const outside = result.entries.some(({ entry }) => entry.date.slice(0, 7) !== opts.month);
  if (outside) {
    const detected = monthOf(result.entries.map(({ entry }) => entry.date));
    throw new AppError(
      'SOURCE_WRONG_MONTH',
      `Las fechas del archivo son de ${detected ?? '?'}, no de ${opts.month}.`,
      { details: { detected, expected: opts.month } },
    );
  }
  return result;
}

/** Kioskos activos de una empresa → búsqueda por `Asset` (Parlevel) y por `Device ID` (Cantaloupe). */
export function buildKioskLookup(
  kiosks: { id: string; parlevelAsset: string | null; cantaloupeDeviceId: string | null }[],
): KioskLookup {
  const lookup: KioskLookup = { byAsset: new Map(), byDevice: new Map() };
  for (const k of kiosks) {
    if (k.parlevelAsset) lookup.byAsset.set(normalizeKey(k.parlevelAsset), k.id);
    if (k.cantaloupeDeviceId) lookup.byDevice.set(normalizeKey(k.cantaloupeDeviceId), k.id);
  }
  return lookup;
}

const PREVIEW_ROWS = 20;
const REJECTED_SHOWN = 50;

/** Lo que ve la persona antes de confirmar: contadores, total con signo, filas rechazadas y las primeras 20. */
export function summarizeSheet(analysis: SheetAnalysis) {
  const cents = analysis.entries.reduce(
    (sum, { entry }) => sum + (parseAmountCents(entry.amount) ?? 0),
    0,
  );
  return {
    rowsRead: analysis.rowsRead,
    rowsRejected: analysis.rejected.length,
    rowsUnknownKiosk: analysis.entries.filter(({ entry }) => entry.flags.length > 0).length,
    total: centsToMoney(cents),
    rejected: analysis.rejected.slice(0, REJECTED_SHOWN),
    sample: analysis.entries.slice(0, PREVIEW_ROWS).map(({ row, entry }) => ({
      row,
      date: entry.date,
      kioskId: entry.kioskId,
      concept: entry.concept,
      amount: entry.amount,
      flags: entry.flags,
    })),
  };
}

import type {
  BalanceCheck,
  BankDraftData,
  BankDraftRow,
  BankExtraction,
  BankRowEdit,
  BankRowFlag,
  BankStatementRow,
} from '@mimark/contracts/closing-uploads';
import { centsToMoney, moneyToCents } from '../../common/money.js';

/**
 * Estado de cuenta leído por IA (spec 022): puras. Lo que sale del PDF es dato; los saldos son el árbitro de la
 * extracción y toda escritura la confirma una persona.
 */

const MAX_CONCEPT = 300;

const signedCents = (value: string): number =>
  value.startsWith('-') ? -moneyToCents(value.slice(1)) : moneyToCents(value);
const amountCents = (value: string | null): number => (value === null ? 0 : moneyToCents(value));

/** Números de tarjeta o cuenta (10 o más dígitos, con espacios o guiones) → «****» + últimos 4 dígitos (AC-022-11). */
export function maskAccountNumbers(text: string): string {
  return text.replace(
    /(?<!\d)\d(?:[ -]?\d){9,}(?!\d)/g,
    (match) => `****${match.replace(/\D/g, '').slice(-4)}`,
  );
}

const cleanConcept = (text: string): string =>
  maskAccountNumbers(text.replace(/\s+/g, ' ').trim()).slice(0, MAX_CONCEPT);

/** La salida de la IA → borrador editable: filas numeradas desde 1 y conceptos sin números completos. */
export function buildDraft(extraction: BankExtraction): BankDraftData {
  return {
    openingBalance: extraction.openingBalance,
    closingBalance: extraction.closingBalance,
    rows: extraction.rows.map((row, i) => ({
      ...row,
      concept: cleanConcept(row.concept),
      row: i + 1,
      discarded: false,
    })),
  };
}

const active = (rows: BankDraftRow[]): BankDraftRow[] => rows.filter((r) => !r.discarded);

/** apertura + depósitos − retiros = cierre, en centavos (AC-022-03). `difference` = cierre − lo calculado. */
export function balanceCheck(draft: BankDraftData): BalanceCheck {
  const computed = active(draft.rows).reduce(
    (sum, r) => sum + amountCents(r.deposit) - amountCents(r.withdrawal),
    signedCents(draft.openingBalance),
  );
  const difference = signedCents(draft.closingBalance) - computed;
  return { ok: difference === 0, difference: centsToMoney(difference) };
}

/**
 * Filas cuyo saldo corrido no sigue al anterior (AC-022-04). Se arrastra el saldo desde la apertura; en una fila
 * que rompe la secuencia se toma el saldo impreso como nuevo punto de partida, así un error marca una sola fila.
 */
export function flagSequenceBreaks(rows: BankDraftRow[], openingBalance: string): Set<number> {
  const broken = new Set<number>();
  let running = signedCents(openingBalance);
  for (const r of active(rows)) {
    running += amountCents(r.deposit) - amountCents(r.withdrawal);
    if (r.balance === null) continue;
    const printed = signedCents(r.balance);
    if (printed !== running) {
      broken.add(r.row);
      running = printed;
    }
  }
  return broken;
}

/** 'AAAA-MM' del mes anterior. */
export function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

export const monthOf = (date: string): string => date.slice(0, 7);

/** Las filas con sus avisos: `UNCERTAIN` (saldo no sigue) y `OUT_OF_MONTH` (AC-022-05). */
export function withFlags(draft: BankDraftData, month: string): BankStatementRow[] {
  const broken = flagSequenceBreaks(draft.rows, draft.openingBalance);
  return draft.rows.map((r) => {
    const flags: BankRowFlag[] = [];
    if (!r.discarded && broken.has(r.row)) flags.push('UNCERTAIN');
    if (!r.discarded && monthOf(r.date) !== month) flags.push('OUT_OF_MONTH');
    return { ...r, flags };
  });
}

/** Filas leídas y filas que no se vuelven movimientos por ser de otro mes. */
export function countRows(draft: BankDraftData, month: string): { read: number; rejected: number } {
  return {
    read: draft.rows.length,
    rejected: active(draft.rows).filter((r) => monthOf(r.date) !== month).length,
  };
}

/** El saldo inicial no coincide con el cierre confirmado del mes anterior de la cuenta (no bloquea). */
export function openingMismatch(openingBalance: string, previousClosing: string | null): boolean {
  return previousClosing !== null && signedCents(openingBalance) !== signedCents(previousClosing);
}

/** Aplica las ediciones de la persona. Devuelve el borrador nuevo y los errores por campo (`rows.0.row`…). */
export function applyEdits(
  draft: BankDraftData,
  edits: BankRowEdit[],
): { draft: BankDraftData; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const rows = draft.rows.map((r) => ({ ...r }));
  edits.forEach((edit, i) => {
    const target = rows.find((r) => r.row === edit.row);
    if (!target) {
      fieldErrors[`rows.${i}.row`] = 'Esa fila no existe en el borrador';
      return;
    }
    if (edit.date !== undefined) target.date = edit.date;
    if (edit.concept !== undefined) target.concept = cleanConcept(edit.concept);
    if (edit.withdrawal !== undefined) target.withdrawal = edit.withdrawal;
    if (edit.deposit !== undefined) target.deposit = edit.deposit;
    if (edit.discarded !== undefined) target.discarded = edit.discarded;
    if (target.withdrawal !== null && target.deposit !== null) {
      fieldErrors[`rows.${i}.deposit`] = 'Una fila es retiro o depósito, no ambos';
    }
  });
  return { draft: { ...draft, rows }, fieldErrors };
}

export interface BankEntry {
  row: number;
  date: string;
  concept: string;
  /** Con signo: depósito +, retiro − (como `bank_csv`). */
  amount: string;
  needsReview: boolean;
  meta: { balance: string | null };
}

/** Movimientos que crea la confirmación: filas no descartadas del mes (AC-022-05, AC-022-07). */
export function toEntries(draft: BankDraftData, month: string): BankEntry[] {
  return withFlags(draft, month)
    .filter((r) => !r.discarded && !r.flags.includes('OUT_OF_MONTH'))
    .map((r) => ({
      row: r.row,
      date: r.date,
      concept: r.concept,
      amount: centsToMoney(amountCents(r.deposit) - amountCents(r.withdrawal)),
      needsReview: r.flags.includes('UNCERTAIN'),
      meta: { balance: r.balance },
    }));
}

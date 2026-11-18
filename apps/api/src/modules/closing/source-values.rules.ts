/** Lectura de valores de celda (spec 021): puras. Todo lo que viene del archivo es dato, nunca instrucción. */

/** El texto de una celda. Una fórmula como «=CMD()» llega aquí ya como texto y así se queda. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function validDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return isoDate(d);
}

/** 'AAAA-MM-DD', 'DD/MM/AAAA', una fecha de Excel (serial o Date) → 'AAAA-MM-DD'; si no, `null`. */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoDate(value);
  if (typeof value === 'number') {
    // Serial de Excel: días desde 1899-12-30. Fuera de 1990–2100 no es una fecha, es otro número.
    if (!Number.isInteger(Math.floor(value)) || value < 32874 || value > 73415) return null;
    return isoDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000));
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mx = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (mx) return validDate(Number(mx[3]), Number(mx[2]), Number(mx[1]));
  return null;
}

/** Un importe → centavos con signo. Acepta números y textos como «$ 1,234.50», «-10» o «(1,234.50)». */
export function parseAmountCents(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== 'string') return null;
  let text = value.replace(/[\s$,]/g, '');
  let negative = false;
  const parens = /^\((.*)\)$/.exec(text);
  if (parens) {
    negative = true;
    text = parens[1] ?? '';
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return negative ? -Math.abs(cents) : cents;
}

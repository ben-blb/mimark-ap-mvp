/**
 * Dinero como centavos enteros. Las comparaciones de importes (cero tolerancia) se hacen
 * siempre en centavos, nunca con números de punto flotante.
 */

/** "11600.5" → 1160050. Lanza si el texto no es un importe válido. */
export function moneyToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Importe inválido: "${value}"`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Importes que vienen como número (p. ej. de la IA): 11600.004 → 1160000. */
export function numberToCents(value: number): number {
  return Math.round(value * 100);
}

/** 1160050 → "11600.50". */
export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

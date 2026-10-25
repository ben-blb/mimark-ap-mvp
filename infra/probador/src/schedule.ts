/**
 * Fechas de negocio para el probador. Es un oráculo propio e independiente del código de la API: el probador
 * es caja negra y calcula lo esperado por su cuenta (vencimiento = recepción + crédito; se paga mié y vie).
 */

const DAY_MS = 86_400_000;

export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const isPayDay = (date: string) => [3, 5].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

export function expectedSchedule(
  receivedOn: string,
  creditDays: number,
  today: string,
): { dueOn: string; suggestedPayOn: string } {
  const dueOn = addDays(receivedOn, creditDays);
  let last = dueOn;
  while (!isPayDay(last)) last = addDays(last, -1);
  if (last >= today) return { dueOn, suggestedPayOn: last };
  let next = today;
  while (!isPayDay(next)) next = addDays(next, 1);
  return { dueOn, suggestedPayOn: next };
}

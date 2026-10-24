import type { LocalDate } from '@mimark/contracts/common';

/**
 * Fechas de negocio como 'YYYY-MM-DD', sin hora. Todo es puro: "hoy" siempre llega como
 * parámetro. Las funciones de Vercel corren en UTC y MIMARK opera en America/Monterrey, así
 * que "hoy" se calcula con toLocalDate(new Date(), env.BUSINESS_TZ) en el service.
 */

const DAY_MS = 86_400_000;

/** Fecha local del negocio para un instante. */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Días de `from` a `to` (negativo si `to` es anterior). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0 = domingo … 3 = miércoles … 5 = viernes … 6 = sábado. */
export function dayOfWeek(date: LocalDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** Prisma guarda @db.Date como un Date a medianoche UTC. */
export function toDbDate(date: LocalDate): Date {
  return new Date(toUtcMs(date));
}

export function fromDbDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

/** Instante UTC en que empieza el día `date` en la zona del negocio (para "desde hoy"). */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const utcMidnight = toUtcMs(date);
  return new Date(utcMidnight - offsetMs(new Date(utcMidnight), timeZone));
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

function toUtcMs(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

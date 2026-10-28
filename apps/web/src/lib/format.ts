/** Formatos de la UI (es-MX). Un solo lugar para dinero, fechas y plazos. */

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormat = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Monterrey',
});

/** "11600.00" → "$11,600.00"; sin centavos → "$11,600" (resúmenes). */
export function formatAmount(amount: string, cents = true): string {
  const digits = cents ? 2 : 0;
  const value = Number(amount).toLocaleString('es-MX', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `$${value}`;
}

/** "11600.00", "MXN" → "$11,600.00 MXN". */
export function formatMoney(amount: string, currency: string, cents = true): string {
  return `${formatAmount(amount, cents)} ${currency}`;
}

/** Fecha de negocio 'YYYY-MM-DD' → "20 oct 2026" (sin desfase de zona horaria). */
export function formatDate(localDate: string): string {
  return dateFormat.format(new Date(`${localDate}T00:00:00Z`));
}

/** Instante ISO → "20 oct 2026, 9:15" en hora de Monterrey. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function paymentTermLabel(creditDays: number): string {
  return creditDays === 0 ? 'Contado' : `Crédito ${creditDays} días`;
}

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekdayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Monterrey',
});

const clean = (text: string) => text.replace(/\./g, '');

/** Fecha de tabla: "25 oct" en el año en curso, "25 oct 2025" si es de otro año. */
export function formatDay(localDate: string, currentYear = new Date().getFullYear()): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const day = clean(dayFormat.format(date));
  return date.getUTCFullYear() === currentYear ? day : `${day} ${date.getUTCFullYear()}`;
}

/** Día de pago: "mié 30 oct". */
export function formatPayDay(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  return `${clean(weekdayFormat.format(date))} ${clean(dayFormat.format(date))}`;
}

/** Instante → "14:05" en hora de Monterrey. */
export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

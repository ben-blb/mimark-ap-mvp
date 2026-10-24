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

/** "11600.00", "MXN" → "$11,600.00 MXN". */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${value} ${currency}`;
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

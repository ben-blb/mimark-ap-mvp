import type { LocalDate } from '@mimark/contracts/common';
import { AppError } from '../../common/app-error.js';
import { addDays, dayOfWeek, diffDays } from '../../common/dates.js';

/** Reglas puras del calendario de pagos de CxP: se paga solo miércoles y viernes. */

export const PAY_WEEKDAYS: readonly number[] = [3, 5];

export function isPayDay(date: LocalDate): boolean {
  return PAY_WEEKDAYS.includes(dayOfWeek(date));
}

export function lastPayDayOnOrBefore(date: LocalDate): LocalDate {
  let day = date;
  while (!isPayDay(day)) day = addDays(day, -1);
  return day;
}

export function nextPayDayOnOrAfter(date: LocalDate): LocalDate {
  let day = date;
  while (!isPayDay(day)) day = addDays(day, 1);
  return day;
}

/**
 * Vencimiento = recepción en CxP + días de crédito. El pago sugerido es el último día de pago que no causa
 * atraso; si ya pasó, el siguiente desde hoy y el expediente queda urgente.
 */
export function computeSchedule(
  receivedOn: LocalDate,
  creditDays: number,
  today: LocalDate,
): { dueOn: LocalDate; suggestedPayOn: LocalDate; urgent: boolean } {
  const dueOn = addDays(receivedOn, creditDays);
  const last = lastPayDayOnOrBefore(dueOn);
  if (last >= today) return { dueOn, suggestedPayOn: last, urgent: false };
  return { dueOn, suggestedPayOn: nextPayDayOnOrAfter(today), urgent: true };
}

export function checkPayOn(payOn: LocalDate, today: LocalDate): void {
  if (!isPayDay(payOn) || diffDays(today, payOn) < 0) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { payOn: 'Elige un miércoles o viernes desde hoy' },
    });
  }
}

export function checkPayment(
  input: { amountCents: number; paidOn: LocalDate },
  totalCents: number,
  today: LocalDate,
): void {
  const fieldErrors: Record<string, string> = {};
  if (input.amountCents !== totalCents) {
    fieldErrors.amount = 'Debe ser igual al total de la factura';
  }
  if (input.paidOn > today) fieldErrors.paidOn = 'La fecha de pago no puede ser futura';
  if (Object.keys(fieldErrors).length > 0)
    throw new AppError('VALIDATION', undefined, { fieldErrors });
}

export function isOverdue(dueOn: LocalDate, today: LocalDate): boolean {
  return dueOn < today;
}

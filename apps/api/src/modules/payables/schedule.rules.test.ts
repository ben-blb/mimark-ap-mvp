import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import {
  checkPayment,
  checkPayOn,
  computeSchedule,
  isOverdue,
  isPayDay,
  lastPayDayOnOrBefore,
  nextPayDayOnOrAfter,
} from './schedule.rules.js';

function errorOf(fn: () => void): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó error');
}

const today = '2026-10-20'; // martes

describe('días de pago', () => {
  it('AC-005-08 solo miércoles y viernes son día de pago', () => {
    expect(isPayDay('2026-10-21')).toBe(true); // mié
    expect(isPayDay('2026-10-23')).toBe(true); // vie
    for (const day of ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-25']) {
      expect(isPayDay(day)).toBe(false);
    }
  });

  it('AC-005-07 busca el día de pago anterior o igual y el siguiente o igual', () => {
    expect(lastPayDayOnOrBefore('2026-10-20')).toBe('2026-10-16'); // martes → viernes anterior
    expect(lastPayDayOnOrBefore('2026-10-21')).toBe('2026-10-21');
    expect(lastPayDayOnOrBefore('2026-10-22')).toBe('2026-10-21'); // jueves → miércoles
    expect(nextPayDayOnOrAfter('2026-10-20')).toBe('2026-10-21');
    expect(nextPayDayOnOrAfter('2026-10-23')).toBe('2026-10-23');
    expect(nextPayDayOnOrAfter('2026-10-24')).toBe('2026-10-28'); // sábado → miércoles
  });
});

describe('computeSchedule (CA-06, hoy = martes 2026-10-20)', () => {
  const cases: [string, string, number, string, string, boolean, boolean][] = [
    ['recibido mar, 15 días', '2026-10-13', 15, '2026-10-28', '2026-10-28', false, false],
    ['recibido vie, 14 días', '2026-10-16', 14, '2026-10-30', '2026-10-30', false, false],
    ['vence hoy martes', '2026-10-13', 7, '2026-10-20', '2026-10-21', true, false],
    ['ya vencida', '2026-10-01', 7, '2026-10-08', '2026-10-21', true, true],
    ['contado recibido hoy', '2026-10-20', 0, '2026-10-20', '2026-10-21', true, false],
  ];

  it.each(cases)(
    'AC-005-07 %s',
    (_name, receivedOn, days, dueOn, suggestedPayOn, urgent, overdue) => {
      expect(computeSchedule(receivedOn, days, today)).toEqual({ dueOn, suggestedPayOn, urgent });
      expect(isOverdue(dueOn, today)).toBe(overdue);
    },
  );

  it('AC-005-07 vence en miércoles y hoy es ese miércoles: se paga hoy y no es urgente', () => {
    expect(computeSchedule('2026-10-14', 0, '2026-10-14')).toEqual({
      dueOn: '2026-10-14',
      suggestedPayOn: '2026-10-14',
      urgent: false,
    });
  });
});

describe('checkPayOn', () => {
  it('AC-005-08 acepta miércoles y viernes desde hoy', () => {
    expect(() => checkPayOn('2026-10-21', today)).not.toThrow();
    expect(() => checkPayOn('2026-10-30', today)).not.toThrow();
    expect(() => checkPayOn('2026-10-14', '2026-10-14')).not.toThrow(); // hoy mismo si es día de pago
  });

  it('AC-005-08 rechaza otro día de la semana o una fecha pasada, indicando el campo', () => {
    for (const payOn of ['2026-10-22', '2026-10-16']) {
      const error = errorOf(() => checkPayOn(payOn, today));
      expect(error.code).toBe('VALIDATION');
      expect(error.extra.fieldErrors).toHaveProperty('payOn');
    }
  });
});

describe('checkPayment', () => {
  it('AC-005-09 acepta el importe igual al total con fecha de hoy o pasada', () => {
    expect(() =>
      checkPayment({ amountCents: 1160000, paidOn: today }, 1160000, today),
    ).not.toThrow();
    expect(() =>
      checkPayment({ amountCents: 1160000, paidOn: '2026-10-01' }, 1160000, today),
    ).not.toThrow();
  });

  it('AC-005-09 rechaza un importe distinto al total, aunque sea por un centavo', () => {
    const error = errorOf(() =>
      checkPayment({ amountCents: 1159999, paidOn: today }, 1160000, today),
    );
    expect(error.extra.fieldErrors).toEqual({ amount: 'Debe ser igual al total de la factura' });
  });

  it('AC-005-09 rechaza una fecha de pago futura', () => {
    const error = errorOf(() =>
      checkPayment({ amountCents: 1160000, paidOn: '2026-10-21' }, 1160000, today),
    );
    expect(error.extra.fieldErrors).toHaveProperty('paidOn');
  });
});

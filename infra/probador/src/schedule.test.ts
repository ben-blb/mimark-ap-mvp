import { describe, expect, it } from 'vitest';
import { addDays, expectedSchedule, localDate } from './schedule.js';

describe('schedule (oráculo del probador, independiente de la API)', () => {
  it('AC-007-04 la fecha local es la de Monterrey, no la de UTC', () => {
    expect(localDate(new Date('2026-10-21T03:30:00Z'), 'America/Monterrey')).toBe('2026-10-20');
    expect(localDate(new Date('2026-10-21T12:00:00Z'), 'America/Monterrey')).toBe('2026-10-21');
  });

  it('AC-007-04 suma días a una fecha de negocio', () => {
    expect(addDays('2026-10-20', 15)).toBe('2026-11-04');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('AC-007-04 calcula vencimiento y pago sugerido como la tabla de la spec 005 (hoy = martes 2026-10-20)', () => {
    const today = '2026-10-20';
    expect(expectedSchedule('2026-10-13', 15, today)).toEqual({
      dueOn: '2026-10-28',
      suggestedPayOn: '2026-10-28',
    });
    expect(expectedSchedule('2026-10-13', 7, today)).toEqual({
      dueOn: '2026-10-20',
      suggestedPayOn: '2026-10-21',
    });
    expect(expectedSchedule('2026-10-01', 7, today)).toEqual({
      dueOn: '2026-10-08',
      suggestedPayOn: '2026-10-21',
    });
    expect(expectedSchedule('2026-10-14', 0, '2026-10-14')).toEqual({
      dueOn: '2026-10-14',
      suggestedPayOn: '2026-10-14',
    });
  });
});

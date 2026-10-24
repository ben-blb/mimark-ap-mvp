import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, diffDays, startOfLocalDay, toLocalDate } from './dates.js';

describe('dates', () => {
  it('calcula "hoy" en Monterrey aunque el servidor corra en UTC', () => {
    // 2026-10-21 02:30 UTC todavía es 20 de octubre en Monterrey (UTC-6).
    expect(toLocalDate(new Date('2026-10-21T02:30:00Z'), 'America/Monterrey')).toBe('2026-10-20');
    expect(toLocalDate(new Date('2026-10-21T06:30:00Z'), 'America/Monterrey')).toBe('2026-10-21');
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-10-13', 15)).toBe('2026-10-28');
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('cuenta días entre fechas', () => {
    expect(diffDays('2026-10-20', '2026-10-28')).toBe(8);
    expect(diffDays('2026-10-28', '2026-10-20')).toBe(-8);
  });

  it('identifica el día de la semana (0 = domingo)', () => {
    expect(dayOfWeek('2026-10-21')).toBe(3); // miércoles
    expect(dayOfWeek('2026-10-23')).toBe(5); // viernes
  });

  it('da el inicio del día de negocio como instante UTC', () => {
    expect(startOfLocalDay('2026-10-20', 'America/Monterrey').toISOString()).toBe(
      '2026-10-20T06:00:00.000Z',
    );
  });
});

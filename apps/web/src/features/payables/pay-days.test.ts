import { describe, expect, it } from 'vitest';
import { nextPayDays } from './pay-days';

describe('nextPayDays', () => {
  it('AC-005-08 ofrece solo miércoles y viernes desde hoy, en orden', () => {
    expect(nextPayDays('2026-10-20', 4)).toEqual([
      '2026-10-21',
      '2026-10-23',
      '2026-10-28',
      '2026-10-30',
    ]);
  });

  it('AC-005-08 incluye hoy si hoy es día de pago', () => {
    expect(nextPayDays('2026-10-21', 2)).toEqual(['2026-10-21', '2026-10-23']);
  });

  it('AC-005-08 por defecto ofrece los próximos 12', () => {
    expect(nextPayDays('2026-10-20')).toHaveLength(12);
  });
});

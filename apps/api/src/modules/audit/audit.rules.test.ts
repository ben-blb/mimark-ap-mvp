import { describe, expect, it } from 'vitest';
import { diffFields } from './audit.rules.js';

describe('diffFields', () => {
  it('AC-002-04 registra solo los campos que cambiaron, con su valor anterior y nuevo', () => {
    const before = { name: 'Norte', creditDays: 15, active: true };
    const after = { name: 'Norte', creditDays: 30, active: false };

    expect(diffFields(before, after, ['name', 'creditDays', 'active'])).toEqual({
      creditDays: { from: 15, to: 30 },
      active: { from: true, to: false },
    });
  });

  it('compara fechas por valor', () => {
    const at = (iso: string) => ({ when: new Date(iso) });
    expect(diffFields(at('2026-10-20T00:00:00Z'), at('2026-10-20T00:00:00Z'), ['when'])).toEqual(
      {},
    );
  });
});

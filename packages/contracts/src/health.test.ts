import { describe, expect, it } from 'vitest';
import { Health } from './health.js';

const ok = { status: 'ok', db: 'ok', version: 'abc1234', environment: 'production' };

describe('Health', () => {
  it('AC-016-08 acepta la respuesta de /api/health, con la base bien o caída', () => {
    expect(Health.parse(ok)).toEqual(ok);
    expect(Health.parse({ ...ok, status: 'degraded', db: 'error' }).db).toBe('error');
  });

  it('AC-016-08 rechaza una respuesta que no cumple el contrato', () => {
    expect(Health.safeParse({ needsSetup: false }).success).toBe(false);
    expect(Health.safeParse({ ...ok, db: 'dormida' }).success).toBe(false);
  });
});

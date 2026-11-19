import { describe, expect, it } from 'vitest';
import { buildStatement, renderStatementPdf, scoreStatement } from './bank-statement.js';

describe('estado de cuenta sintético (spec 022)', () => {
  it('AC-022-03 los saldos del fixture cuadran: apertura + depósitos − retiros = cierre', () => {
    const s = buildStatement('2026-09');
    const c = (v: string | null) => (v === null ? 0 : Math.round(Number(v) * 100));
    const sum = s.rows.reduce((acc, r) => acc + c(r.deposit) - c(r.withdrawal), c(s.opening));
    expect(sum).toBe(c(s.closing));
    expect(s.rows.every((r) => r.date.startsWith('2026-09'))).toBe(true);
  });

  it('AC-022-02 el PDF se genera con firma PDF', async () => {
    const bytes = await renderStatementPdf(buildStatement('2026-09'));
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('AC-022-12 la evaluación cuenta filas exactas y detecta saldos distintos', () => {
    const want = buildStatement('2026-09', 4);
    const bad = structuredClone(want);
    bad.rows[2]!.deposit = '1.00';
    bad.closing = '0.00';
    expect(scoreStatement(want, want)).toMatchObject({ exact: 4, misses: [], balancesOk: true });
    expect(scoreStatement(want, bad)).toMatchObject({ exact: 3, misses: [2], balancesOk: false });
    expect(scoreStatement(want, null).exact).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { formatEvalReport, formatProbadorReport, type CaseResult } from './report.js';
import { scoreEval, type EvalResult } from './score.js';

const pass: CaseResult = {
  id: 'CA-01',
  title: 'Factura válida',
  expected: 'pending_confirmation, sin razones',
  observed: 'pending_confirmation, sin razones',
  state: 'pending_confirmation',
  ref: 'iad1::abc123',
  ms: 8400,
  pass: true,
};
const fail: CaseResult = {
  id: 'CA-02',
  title: 'Sin OC',
  expected: 'requires_review, MISSING_FIELD:purchaseOrderNumber',
  observed: 'pending_confirmation, sin razones',
  state: 'pending_confirmation',
  ref: 'iad1::def456',
  ms: 12000,
  pass: false,
};
const meta = { url: 'https://mimark.example', at: '2026-10-25T20:00:00.000Z' };

describe('formatProbadorReport', () => {
  const report = formatProbadorReport([pass, fail], meta);

  it('AC-007-04 cada caso lleva id, esperado, observado, estado con ref y duración, y PASS/FAIL', () => {
    expect(report).toContain(
      [
        '[CA-01] Factura válida',
        '  esperado:  pending_confirmation, sin razones',
        '  observado: pending_confirmation, sin razones',
        '  estado:    pending_confirmation · ref iad1::abc123 · 8.4 s',
        '  resultado: PASS',
      ].join('\n'),
    );
    expect(report).toContain('[CA-02] Sin OC');
    expect(report).toContain('  resultado: FAIL');
    expect(report).toContain('12.0 s');
  });

  it('AC-007-04 cierra con un resumen de casos, PASS y FAIL', () => {
    expect(report).toMatch(/Resumen: 2 casos · 1 PASS · 1 FAIL/);
    expect(report).toContain('https://mimark.example');
    expect(report).toContain('2026-10-25T20:00:00.000Z');
  });

  it('AC-007-04 con todos en PASS lo dice y no menciona fallas', () => {
    const ok = formatProbadorReport([pass], meta);
    expect(ok).toMatch(/Resumen: 1 caso · 1 PASS · 0 FAIL/);
  });

  it('AC-007-04 nunca incluye secretos: el reporte solo recibe resultados, no credenciales', () => {
    expect(report).not.toMatch(/PROBADOR_CODE|cookie|password/i);
  });
});

describe('formatEvalReport', () => {
  const fieldsOk = {
    supplierName: 'A',
    supplierTaxId: 'B',
    invoiceNumber: 'C',
    issueDate: '2026-10-01',
    poNumber: 'OC-1',
    subtotal: '1.00',
    taxes: '0.16',
    total: '1.16',
    currency: 'MXN',
    taxUuid: 'U',
  };
  const results: EvalResult[] = [
    {
      id: 'v1',
      kind: 'valida',
      expected: fieldsOk,
      outOfScope: false,
      actual: { fields: { ...fieldsOk, total: '9.99' }, status: 'pending_confirmation' },
    },
  ];
  const md = formatEvalReport(scoreEval(results), {
    url: 'https://x',
    at: '2026-10-25T20:00:00.000Z',
    model: 'claude-haiku-5-5',
    promptVersion: 'extract-invoice@1',
    documents: 1,
  });

  it('AC-007-04 incluye modelo y versión del prompt para comparar corridas', () => {
    expect(md).toContain('claude-haiku-5-5');
    expect(md).toContain('extract-invoice@1');
  });

  it('AC-007-04 la tabla trae exactitud por campo con aciertos y esperados', () => {
    expect(md).toMatch(/\| total \| 0 \| 1 \| 0\.0 % \|/);
    expect(md).toMatch(/\| supplierTaxId \| 1 \| 1 \| 100\.0 % \|/);
  });

  it('AC-007-04 lista las fallas, los inventados y la detección de fuera de alcance, y dice si cumple la meta', () => {
    expect(md).toContain('v1');
    expect(md).toContain('9.99');
    expect(md).toMatch(/Valores inventados: 0/);
    expect(md).toMatch(/Fuera de alcance detectados: 0 de 0/);
    expect(md).toContain('NO cumple la meta');
  });
});

import { describe, expect, it } from 'vitest';
import { EVAL_FIELDS, matches, scoreEval, type EvalResult, type FieldValues } from './score.js';

const full = {
  supplierName: 'Distribuidora Alimentos del Norte SA de CV',
  supplierTaxId: 'DAN010203AB1',
  invoiceNumber: 'A-100',
  issueDate: '2026-10-06',
  poNumber: 'OC-1001',
  subtotal: '10000.00',
  taxes: '1600.00',
  total: '11600.00',
  currency: 'MXN',
  taxUuid: '6A1F3C52-8B7D-4E19-9C0A-2D5E7F8A9B10',
};
const nothing = Object.fromEntries(EVAL_FIELDS.map((f) => [f, null])) as FieldValues;

const doc = (id: string, over: Partial<EvalResult> = {}): EvalResult => ({
  id,
  kind: 'valida',
  expected: { ...full },
  outOfScope: false,
  actual: { fields: { ...full }, status: 'pending_confirmation' },
  ...over,
});

describe('matches', () => {
  it('AC-007-04 compara textos sin importar mayúsculas ni espacios de más', () => {
    expect(matches('supplierName', 'Café  Sierra Madre SC', ' café sierra madre sc ')).toBe(true);
    expect(matches('supplierTaxId', 'DAN010203AB1', 'DAN010203AB2')).toBe(false);
  });

  it('AC-007-04 compara importes por valor, no por texto', () => {
    expect(matches('total', '11600.00', '11600')).toBe(true);
    expect(matches('total', '11600.00', '11600.01')).toBe(false);
  });

  it('AC-007-04 null contra null acierta; null contra un valor no', () => {
    expect(matches('poNumber', null, null)).toBe(true);
    expect(matches('poNumber', 'OC-1001', null)).toBe(false);
    expect(matches('poNumber', null, 'OC-1001')).toBe(false);
  });
});

describe('scoreEval', () => {
  it('AC-007-04 con todo correcto: 100 % por campo, sin inventados, y cumple la meta', () => {
    const score = scoreEval([doc('1'), doc('2')]);
    expect(score.fields.total).toEqual({ hits: 2, expected: 2, accuracy: 1 });
    expect(score.invented).toEqual([]);
    expect(score.overall).toBe(1);
    expect(score.meetsGoal).toBe(true);
  });

  it('AC-007-04 un campo mal leído baja la exactitud de ese campo y deja la lista de fallas', () => {
    const wrong = doc('2', {
      actual: { fields: { ...full, total: '11600.50' }, status: 'pending_confirmation' },
    });
    const score = scoreEval([doc('1'), wrong]);
    expect(score.fields.total).toEqual({ hits: 1, expected: 2, accuracy: 0.5 });
    expect(score.fields.supplierTaxId.accuracy).toBe(1);
    expect(score.failures).toEqual([
      { id: '2', field: 'total', expected: '11600.00', observed: '11600.50' },
    ]);
    expect(score.meetsGoal).toBe(false);
  });

  it('AC-007-04 cuenta como inventado un campo esperado null con valor extraído', () => {
    const noPo = doc('3', {
      kind: 'sin-oc',
      expected: { ...full, poNumber: null },
      actual: { fields: { ...full, poNumber: 'OC-1001' }, status: 'pending_confirmation' },
    });
    const score = scoreEval([doc('1'), noPo]);
    expect(score.invented).toEqual([{ id: '3', field: 'poNumber', observed: 'OC-1001' }]);
    expect(score.fields.poNumber).toEqual({ hits: 1, expected: 1, accuracy: 1 }); // solo cuenta lo esperado
    expect(score.meetsGoal).toBe(false);
  });

  it('AC-007-04 un campo null esperado y devuelto null es un acierto para el reporte, no un inventado', () => {
    const noPo = doc('3', {
      kind: 'sin-oc',
      expected: { ...full, poNumber: null },
      actual: { fields: { ...full, poNumber: null }, status: 'requires_review' },
    });
    const score = scoreEval([noPo]);
    expect(score.invented).toEqual([]);
    expect(score.meetsGoal).toBe(true);
  });

  it('AC-007-04 mide la detección de documentos fuera de alcance', () => {
    const payroll = (id: string, status: string): EvalResult => ({
      id,
      kind: 'fuera',
      expected: { ...nothing },
      outOfScope: true,
      actual: { fields: { ...nothing }, status },
    });
    const score = scoreEval([
      doc('1'),
      payroll('n1', 'out_of_scope'),
      payroll('n2', 'pending_confirmation'),
    ]);
    expect(score.outOfScope).toEqual({ detected: 1, total: 2, missed: ['n2'] });
    expect(score.meetsGoal).toBe(false);
    expect(scoreEval([payroll('n1', 'out_of_scope')]).outOfScope.detected).toBe(1);
  });

  it('AC-007-04 un documento sin respuesta (la API falló) cuenta como fallo en todos sus campos', () => {
    const lost = doc('9', { actual: null });
    const score = scoreEval([doc('1'), lost]);
    expect(score.fields.total).toEqual({ hits: 1, expected: 2, accuracy: 0.5 });
    expect(score.noResponse).toEqual(['9']);
  });
});

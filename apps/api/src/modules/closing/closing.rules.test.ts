import { describe, expect, it } from 'vitest';
import {
  matchRule,
  normalizeKey,
  sortCategories,
  suggestRule,
  type MatchableRule,
} from './closing.rules.js';

const rule = (id: string, pattern: string, priority = 0, active = true): MatchableRule => ({
  id,
  patternKey: normalizeKey(pattern),
  priority,
  active,
});

describe('normalizeKey', () => {
  it('AC-020-10 pasa a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizeKey('  ADT   Seguridad  Vigilancia ')).toBe('adt seguridad vigilancia');
    expect(normalizeKey('Teléfono ÑANDÚ')).toBe('telefono nandu');
  });
});

describe('matchRule', () => {
  const adt = [rule('adt', 'ADT SECURITY')];

  it('AC-020-10 encuentra el patrón dentro de un concepto largo', () => {
    expect(matchRule('ADT SECURITY CR MU RFC:XXX 7455…', adt)?.id).toBe('adt');
  });

  it('AC-020-10 no distingue mayúsculas, acentos ni espacios repetidos', () => {
    expect(matchRule('adt  security', adt)?.id).toBe('adt');
    expect(matchRule('Pago Télcel', [rule('t', 'TELCEL')])?.id).toBe('t');
  });

  it('AC-020-10 con igual prioridad gana el patrón más largo', () => {
    const rules = [rule('corta', 'TELCEL'), rule('larga', 'TELCEL PLAZA')];
    expect(matchRule('PAGO TELCEL PLAZA SATELITE', rules)?.id).toBe('larga');
  });

  it('AC-020-10 gana la mayor prioridad aunque el patrón sea más corto', () => {
    const rules = [rule('corta', 'TELCEL', 5), rule('larga', 'TELCEL PLAZA', 0)];
    expect(matchRule('PAGO TELCEL PLAZA SATELITE', rules)?.id).toBe('corta');
  });

  it('AC-020-10 sin coincidencia devuelve null', () => {
    expect(matchRule('COMPRA FERRETERIA', adt)).toBeNull();
  });

  it('AC-020-10 ignora las reglas inactivas', () => {
    expect(matchRule('ADT SECURITY', [rule('adt', 'ADT SECURITY', 0, false)])).toBeNull();
  });
});

describe('sortCategories', () => {
  it('AC-020-07 ordena por la posición del renglón en el EDO RES y luego por sortOrder', () => {
    const rows = [
      { edoResLine: 'Rentas', sortOrder: 10 },
      { edoResLine: 'Ventas', sortOrder: 50 },
      { edoResLine: 'Ventas', sortOrder: 20 },
    ] as const;
    expect(sortCategories(rows).map((c) => `${c.edoResLine}:${c.sortOrder}`)).toEqual([
      'Ventas:20',
      'Ventas:50',
      'Rentas:10',
    ]);
  });
});

describe('suggestRule', () => {
  const rules = [rule('adt', 'ADT SECURITY'), rule('tel', 'TELMEX INTERNET', 5)];

  it('AC-023-02 sugiere la regla que comparte palabras con el concepto', () => {
    expect(suggestRule('PAGO ADT MONITOREO', rules)?.id).toBe('adt');
    expect(suggestRule('Telmex servicio', rules)?.id).toBe('tel');
  });

  it('AC-023-02 sin palabras en común no sugiere nada, y las inactivas se ignoran', () => {
    expect(suggestRule('GASOLINERA', rules)).toBeNull();
    expect(suggestRule('ADT', [rule('adt', 'ADT SECURITY', 0, false)])).toBeNull();
  });

  it('AC-023-02 a igual coincidencia gana la de mayor prioridad', () => {
    const tied = [rule('a', 'OXXO SUC', 1), rule('b', 'OXXO CENTRO', 9)];
    expect(suggestRule('OXXO 123', tied)?.id).toBe('b');
  });
});

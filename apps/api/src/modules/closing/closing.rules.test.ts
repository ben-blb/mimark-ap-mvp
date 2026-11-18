import { describe, expect, it } from 'vitest';
import { matchRule, normalizeKey, type MatchableRule } from './closing.rules.js';

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

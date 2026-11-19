import { describe, expect, it } from 'vitest';
import { can } from './permissions.js';
import { ROLES } from './session.js';
import {
  CreateAccountInput,
  CreateCategoryInput,
  CreateKioskInput,
  CreateRuleInput,
  EDO_RES_LINES,
} from './closing.js';

describe('permisos del cierre (spec 020)', () => {
  it('AC-020-01 AC-024-15 admin lee y escribe el cierre; manager solo ve los reportes; el resto no tiene acceso', () => {
    expect(ROLES.filter((r) => can(r, 'reports:read'))).toEqual(['admin']);
    expect(ROLES.filter((r) => can(r, 'reports:write'))).toEqual(['admin']);
    expect(ROLES.filter((r) => can(r, 'reports:view')).sort()).toEqual(['admin', 'manager']);
    for (const role of ['purchasing', 'warehouse', 'payables'] as const) {
      expect(can(role, 'reports:read')).toBe(false);
      expect(can(role, 'reports:write')).toBe(false);
      expect(can(role, 'reports:view')).toBe(false);
    }
  });
});

describe('contratos del catálogo del cierre (spec 020)', () => {
  it('AC-020-05 last4 son exactamente cuatro dígitos', () => {
    const base = { companyId: 'c1', name: 'Cheques', type: 'checking' };
    expect(CreateAccountInput.safeParse({ ...base, last4: '1234' }).success).toBe(true);
    expect(CreateAccountInput.safeParse({ ...base }).success).toBe(true);
    for (const last4 of ['123', '12345', 'abcd', '1234567890123456']) {
      expect(CreateAccountInput.safeParse({ ...base, last4 }).success).toBe(false);
    }
  });

  it('AC-020-04 el kiosko acepta identificadores opcionales de cada fuente', () => {
    expect(CreateKioskInput.safeParse({ companyId: 'c1', name: 'K1' }).success).toBe(true);
    const parsed = CreateKioskInput.parse({
      companyId: 'c1',
      name: 'K1',
      parlevelAsset: ' A-1 ',
      cantaloupeDeviceId: 'D-9',
    });
    expect(parsed.parlevelAsset).toBe('A-1');
  });

  it('AC-020-08 code en mayúsculas y guiones bajos, y renglón del conjunto permitido', () => {
    const ok = { code: 'RENTAS', name: 'Rentas', edoResLine: EDO_RES_LINES[0], kind: 'expense' };
    expect(CreateCategoryInput.safeParse(ok).success).toBe(true);
    expect(CreateCategoryInput.safeParse({ ...ok, code: 'rentas' }).success).toBe(false);
    expect(CreateCategoryInput.safeParse({ ...ok, code: 'A B' }).success).toBe(false);
    expect(CreateCategoryInput.safeParse({ ...ok, edoResLine: 'Inventado' }).success).toBe(false);
  });

  it('AC-020-09 el patrón de una regla tiene al menos 3 caracteres', () => {
    const base = { categoryId: 'cat1', priority: 10 };
    expect(CreateRuleInput.safeParse({ ...base, pattern: 'ADT SECURITY' }).success).toBe(true);
    expect(CreateRuleInput.safeParse({ ...base, pattern: '' }).success).toBe(false);
    expect(CreateRuleInput.safeParse({ ...base, pattern: ' ab ' }).success).toBe(false);
    expect(CreateRuleInput.parse({ categoryId: 'c', pattern: 'abc' }).priority).toBe(0);
  });
});

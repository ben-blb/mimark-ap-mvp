import { describe, expect, it } from 'vitest';
import { ROLES } from './session.js';
import { can, PERMISSIONS, ROLE_PERMISSIONS } from './permissions.js';
import { ChangePasswordInput, LoginInput, SetupInput } from './session.js';
import { CreateUserInput } from './users.js';

describe('contraseña y correo', () => {
  it.each([
    [
      'SetupInput',
      (password: string) =>
        SetupInput.safeParse({ code: 'c', name: 'Ana', email: 'a@b.mx', password }),
    ],
    [
      'CreateUserInput',
      (password: string) =>
        CreateUserInput.safeParse({ name: 'Ana', email: 'a@b.mx', role: 'admin', password }),
    ],
    [
      'ChangePasswordInput',
      (newPassword: string) => ChangePasswordInput.safeParse({ currentPassword: 'x', newPassword }),
    ],
  ])('AC-013-10 %s rechaza una contraseña de 9 caracteres y acepta una de 10', (_name, parse) => {
    const short = parse('123456789');
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.path.at(-1)).toMatch(/password|newPassword/i);
    expect(parse('1234567890').success).toBe(true);
  });

  it('AC-013-05 el correo se normaliza a minúsculas y sin espacios', () => {
    const parsed = LoginInput.parse({ email: '  Ana@Mimark.MX ', password: 'x' });
    expect(parsed.email).toBe('ana@mimark.mx');
  });

  it('AC-013-05 rechaza un correo inválido', () => {
    expect(LoginInput.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(false);
  });
});

describe('matriz de permisos', () => {
  it.each([
    ['warehouse', 'orders:receive', true],
    ['warehouse', 'payables:read', false],
    ['warehouse', 'dashboard:read', false],
    ['manager', 'payables:pay', true],
    ['manager', 'payables:write', false],
    ['purchasing', 'suppliers:write', true],
    ['purchasing', 'payables:pay', false],
    ['payables', 'users:manage', false],
    ['payables', 'payables:write', true],
  ] as const)('AC-013-13 %s · %s → %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  it('AC-013-17 solo admin gestiona usuarios y tiene todos los permisos', () => {
    expect(ROLES.filter((r) => can(r, 'users:manage'))).toEqual(['admin']);
    expect(ROLE_PERMISSIONS.admin).toEqual(PERMISSIONS);
  });
});

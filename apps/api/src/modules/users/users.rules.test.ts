import { describe, expect, it } from 'vitest';
import { checkAdminChange } from './users.rules.js';

const admin = { id: 'a1', role: 'admin', active: true } as const;
const buyer = { id: 'b1', role: 'purchasing', active: true } as const;

describe('checkAdminChange', () => {
  it.each([
    ['otro admin se desactiva con 2 admins', 'a2', admin, { active: false }, 2, null],
    ['otro admin pierde el rol con 2 admins', 'a2', admin, { role: 'manager' }, 2, null],
    [
      'AC-013-23 nadie se quita el rol a sí mismo',
      'a1',
      admin,
      { role: 'manager' },
      3,
      'SELF_PROTECTED',
    ],
    [
      'AC-013-23 nadie se desactiva a sí mismo',
      'a1',
      admin,
      { active: false },
      3,
      'SELF_PROTECTED',
    ],
    ['AC-013-23 no se deja al sistema sin admin', 'a2', admin, { active: false }, 1, 'LAST_ADMIN'],
    ['un no admin cambia sin restricción', 'a1', buyer, { active: false }, 1, null],
    ['renombrar a un admin no lo afecta', 'a1', admin, {}, 1, null],
  ] as const)('%s', (_name, actorId, target, change, activeAdmins, expected) => {
    expect(checkAdminChange(actorId, target, change, activeAdmins)).toBe(expected);
  });
});

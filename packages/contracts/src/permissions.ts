import type { Role } from './session.js';

/** Permisos de las specs 013, 017 y 020. La API los exige y la web los usa para mostrar u ocultar acciones. */
export const PERMISSIONS = [
  'suppliers:read',
  'suppliers:write',
  'orders:read',
  'orders:write',
  'orders:receive',
  'payables:read',
  'payables:write',
  'payables:pay',
  'dashboard:read',
  'assistant:use',
  'inbox:read',
  'users:manage',
  'reports:read',
  'reports:write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Matriz fija en código (spec 017): cada rol ve solo lo de su función. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  purchasing: [
    'inbox:read',
    'suppliers:read',
    'suppliers:write',
    'orders:read',
    'orders:write',
    'assistant:use',
  ],
  warehouse: ['orders:receive'],
  payables: [
    'inbox:read',
    'suppliers:read',
    'orders:read',
    'payables:read',
    'payables:write',
    'payables:pay',
    'dashboard:read',
    'assistant:use',
  ],
  manager: [
    'suppliers:read',
    'orders:read',
    'payables:read',
    'payables:pay',
    'dashboard:read',
    'assistant:use',
    'reports:read',
  ],
  admin: PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

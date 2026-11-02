import type { Role } from './session.js';

/** Permisos de la spec 013. La API los exige y la web los usa para mostrar u ocultar acciones. */
export const PERMISSIONS = [
  'suppliers:write',
  'orders:write',
  'orders:receive',
  'payables:read',
  'payables:write',
  'payables:pay',
  'dashboard:read',
  'assistant:use',
  'users:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Matriz fija en código. Las lecturas de proveedores y órdenes están abiertas a cualquier sesión. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  purchasing: [
    'suppliers:write',
    'orders:write',
    'payables:read',
    'dashboard:read',
    'assistant:use',
  ],
  warehouse: ['orders:receive', 'assistant:use'],
  payables: ['payables:read', 'payables:write', 'payables:pay', 'dashboard:read', 'assistant:use'],
  manager: ['payables:read', 'payables:pay', 'dashboard:read', 'assistant:use'],
  admin: PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

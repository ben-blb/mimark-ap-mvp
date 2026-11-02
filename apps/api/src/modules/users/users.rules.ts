import type { Role } from '@mimark/contracts/session';
import type { UpdateUserInput } from '@mimark/contracts/users';

/** Reglas de usuarios (spec 013). Puras. */

export interface UserTarget {
  id: string;
  role: Role;
  active: boolean;
}

/**
 * ¿El cambio le quita a la persona su condición de administrador activo?
 * Si es así, nadie puede hacérselo a sí mismo y siempre debe quedar otro administrador activo.
 */
export function checkAdminChange(
  actorId: string,
  target: UserTarget,
  change: UpdateUserInput,
  activeAdmins: number,
): 'SELF_PROTECTED' | 'LAST_ADMIN' | null {
  const loosesAdmin =
    target.role === 'admin' &&
    target.active &&
    ((change.role !== undefined && change.role !== 'admin') || change.active === false);
  if (!loosesAdmin) return null;
  if (target.id === actorId) return 'SELF_PROTECTED';
  if (activeAdmins <= 1) return 'LAST_ADMIN';
  return null;
}

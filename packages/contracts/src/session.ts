import { z } from 'zod';

/** Roles del SRS. Los asigna un administrador (spec 013); cada uno tiene sus permisos en permissions.ts. */
export const ROLES = ['purchasing', 'warehouse', 'payables', 'manager', 'admin'] as const;
export const Role = z.enum(ROLES, { error: 'Elige un rol' });
export type Role = z.infer<typeof Role>;

export const MIN_PASSWORD_LENGTH = 10;

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, 'Máximo 200 caracteres')
  .pipe(z.email('Escribe un correo válido'));

/** Contraseña nueva: al menos 10 caracteres. */
export const Password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(200, 'Máximo 200 caracteres');

export const PersonName = z
  .string()
  .trim()
  .min(2, 'Escribe el nombre')
  .max(60, 'Máximo 60 caracteres');

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1, 'Escribe tu contraseña').max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const SetupInput = z.object({
  code: z.string().min(1, 'Escribe el código de configuración').max(200),
  name: PersonName,
  email: Email,
  password: Password,
});
export type SetupInput = z.infer<typeof SetupInput>;

export const SetupStatus = z.object({ needsSetup: z.boolean() });
export type SetupStatus = z.infer<typeof SetupStatus>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual').max(200),
  newPassword: Password,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const SessionDto = z.object({
  userId: z.string(),
  actor: z.string(),
  role: Role,
  mustChangePassword: z.boolean(),
  expiresAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof SessionDto>;

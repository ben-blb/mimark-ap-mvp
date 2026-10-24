import { z } from 'zod';

/** Roles del SRS. En el MVP solo se registran en la auditoría; no restringen acciones. */
export const ROLES = ['purchasing', 'warehouse', 'payables', 'manager', 'admin'] as const;
export const Role = z.enum(ROLES, { error: 'Elige un rol' });
export type Role = z.infer<typeof Role>;

export const LoginInput = z.object({
  code: z.string().min(1, 'Escribe el código de acceso').max(200),
  name: z.string().trim().min(2, 'Escribe tu nombre').max(60, 'Máximo 60 caracteres'),
  role: Role,
});
export type LoginInput = z.infer<typeof LoginInput>;

export const SessionDto = z.object({
  actor: z.string(),
  role: Role,
  expiresAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof SessionDto>;

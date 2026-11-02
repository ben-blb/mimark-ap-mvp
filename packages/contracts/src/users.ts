import { z } from 'zod';
import { Id, listOf } from './common.js';
import { Email, Password, PersonName, Role } from './session.js';

export const UserDto = z.object({
  id: Id,
  name: z.string(),
  email: z.string(),
  role: Role,
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type UserDto = z.infer<typeof UserDto>;

export const UserList = listOf(UserDto);
export type UserList = z.infer<typeof UserList>;

export const CreateUserInput = z.object({
  name: PersonName,
  email: Email,
  role: Role,
  /** Contraseña temporal: la persona la cambia al entrar. */
  password: Password,
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z
  .object({ name: PersonName, role: Role, active: z.boolean() })
  .partial();
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const ResetPasswordOutput = z.object({ temporaryPassword: z.string() });
export type ResetPasswordOutput = z.infer<typeof ResetPasswordOutput>;

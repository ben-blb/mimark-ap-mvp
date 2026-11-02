import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateUserInput,
  ResetPasswordOutput,
  UpdateUserInput,
  UserDto,
  UserList,
} from '@mimark/contracts/users';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, type Tx } from '../../common/db.js';
import type { User } from '../../generated/prisma/client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { generateTemporaryPassword, hashSecret } from '../session/session.rules.js';
import { UsersRepository } from './users.repository.js';
import { checkAdminChange } from './users.rules.js';

const AUDITED_FIELDS = ['name', 'role', 'active'] as const;
const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe ese usuario.');

/** Casos de uso de usuarios (solo admin). Cada escritura va con su auditoría en la misma transacción. */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly users: UsersRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(): Promise<UserList> {
    const rows = await this.users.list();
    return { items: rows.map(toUserDto) };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw NOT_FOUND();
    return toUserDto(user);
  }

  create(input: CreateUserInput, ctx: Ctx): Promise<UserDto> {
    const { password, ...data } = input;
    const passwordHash = hashSecret(password);
    return this.db.$transaction(async (tx) => {
      const user = await this.users.create({ ...data, passwordHash, mustChangePassword: true }, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'user',
          entityId: user.id,
          action: 'user.created',
          data: { after: data },
        },
        tx,
      );
      return toUserDto(user);
    });
  }

  update(id: string, input: UpdateUserInput, ctx: Ctx): Promise<UserDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.guardedTarget(id, input, ctx, tx);
      const after = await this.users.update(id, input, tx);
      const changes = diffFields(before, after, AUDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await this.audit.log(
          {
            ...ctx,
            entity: 'user',
            entityId: id,
            action: 'user.updated',
            ...statusChange(before, after),
            data: { changes },
          },
          tx,
        );
      }
      return toUserDto(after);
    });
  }

  /** "Borrar" = desactivar: la fila y su historial de auditoría se conservan. Es idempotente. */
  deactivate(id: string, ctx: Ctx): Promise<void> {
    return this.db.$transaction(async (tx) => {
      const before = await this.guardedTarget(id, { active: false }, ctx, tx);
      if (!before.active) return;
      await this.users.update(id, { active: false }, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'user',
          entityId: id,
          action: 'user.deactivated',
          fromStatus: 'active',
          toStatus: 'inactive',
        },
        tx,
      );
    });
  }

  resetPassword(id: string, ctx: Ctx): Promise<ResetPasswordOutput> {
    const temporaryPassword = generateTemporaryPassword(randomBytes(16));
    const passwordHash = hashSecret(temporaryPassword);
    return this.db.$transaction(async (tx) => {
      if (!(await this.users.findById(id, tx))) throw NOT_FOUND();
      await this.users.setPassword(id, passwordHash, true, tx);
      await this.audit.log(
        { ...ctx, entity: 'user', entityId: id, action: 'user.password_reset' },
        tx,
      );
      return { temporaryPassword };
    });
  }

  /** Carga al usuario y verifica que el cambio no deje al sistema sin administrador. */
  private async guardedTarget(
    id: string,
    change: UpdateUserInput,
    ctx: Ctx,
    tx: Tx,
  ): Promise<User> {
    const target = await this.users.findById(id, tx);
    if (!target) throw NOT_FOUND();
    const problem = checkAdminChange(
      ctx.userId,
      target,
      change,
      await this.users.countActiveAdmins(tx),
    );
    if (problem) throw new AppError(problem);
    return target;
  }
}

/** Rol o estado antes y después, para consultar el historial sin abrir el detalle. */
function statusChange(before: User, after: User): { fromStatus?: string; toStatus?: string } {
  if (before.role !== after.role) return { fromStatus: before.role, toStatus: after.role };
  if (before.active !== after.active) {
    return {
      fromStatus: before.active ? 'active' : 'inactive',
      toStatus: after.active ? 'active' : 'inactive',
    };
  }
  return {};
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

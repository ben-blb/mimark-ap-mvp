import { Injectable } from '@nestjs/common';
import type { CreateUserInput, UpdateUserInput } from '@mimark/contracts/users';
import { AppError } from '../../common/app-error.js';
import { Db, isUniqueViolation, type Tx } from '../../common/db.js';
import type { User } from '../../generated/prisma/client.js';

const EMAIL_TAKEN = new AppError('EMAIL_TAKEN', undefined, {
  fieldErrors: { email: 'Ya existe un usuario con ese correo' },
});

/** Única puerta que escribe en la tabla de usuarios. Otros módulos (session) solo la leen. */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: Db) {}

  list(): Promise<User[]> {
    return this.db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  findById(id: string, tx: Tx = this.db): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  findByEmail(email: string, tx: Tx = this.db): Promise<User | null> {
    return tx.user.findUnique({ where: { email } });
  }

  count(tx: Tx = this.db): Promise<number> {
    return tx.user.count();
  }

  countActiveAdmins(tx: Tx = this.db): Promise<number> {
    return tx.user.count({ where: { role: 'admin', active: true } });
  }

  async create(
    data: Omit<CreateUserInput, 'password'> & { passwordHash: string; mustChangePassword: boolean },
    tx: Tx = this.db,
  ): Promise<User> {
    try {
      return await tx.user.create({ data });
    } catch (error) {
      if (isUniqueViolation(error)) throw EMAIL_TAKEN;
      throw error;
    }
  }

  update(id: string, data: UpdateUserInput, tx: Tx = this.db): Promise<User> {
    return tx.user.update({ where: { id }, data });
  }

  setPassword(
    id: string,
    passwordHash: string,
    mustChangePassword: boolean,
    tx: Tx = this.db,
  ): Promise<User> {
    return tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword } });
  }

  /** Bloquea la creación concurrente del primer administrador hasta el fin de la transacción. */
  async lockSetup(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1301)`;
  }
}

import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente de base de datos. Lo usan los repositorios para consultar y los services
 * solo para abrir transacciones (`db.$transaction`).
 */
@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Cliente dentro de una transacción. Los métodos de repositorio lo reciben como último argumento. */
export type Tx = Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

@Global()
@Module({ providers: [Db], exports: [Db] })
export class DbModule {}

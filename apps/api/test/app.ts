import type { Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Role } from '@mimark/contracts/session';
import request from 'supertest';
import { configureApp } from '../src/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { Db } from '../src/common/db.js';
import { hashSecret } from '../src/modules/session/session.rules.js';
import { TEST_PASSWORD } from './env.js';

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * La app completa (guard, filtro, validación, módulos) contra la base de pruebas.
 * `configure` permite sustituir dependencias: b => b.overrideProvider(X).useValue(fake).
 */
export async function createTestApp(configure?: (b: TestingModuleBuilder) => TestingModuleBuilder) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (configure ? configure(builder) : builder).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const db = app.get(Db);

  /** Crea (o reutiliza) un usuario activo con contraseña TEST_PASSWORD y sin cambio pendiente. */
  function createUser(
    name: string,
    role: Role,
    overrides: { active?: boolean; mustChangePassword?: boolean } = {},
  ) {
    const email = `${role}-${name.toLowerCase().replace(/\W+/g, '-')}@pruebas.mx`;
    const data = {
      name,
      role,
      active: overrides.active ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordHash: hashSecret(TEST_PASSWORD),
    };
    return db.user.upsert({ where: { email }, create: { email, ...data }, update: data });
  }

  /** Entra con correo y contraseña (por defecto TEST_PASSWORD) y devuelve el cliente con su cookie. */
  async function login(email: string, password: string = TEST_PASSWORD) {
    const agent = request.agent(server);
    await agent.post('/api/session').send({ email, password }).expect(200);
    return agent;
  }

  return {
    db,
    /** Una dependencia de la app, p. ej. para espiar un repositorio con vi.spyOn. */
    get: <T>(token: Type<T>) => app.get(token),
    /** Cliente HTTP sin sesión. */
    http: () => request(server),
    createUser,
    login,
    /**
     * Cliente HTTP con sesión iniciada como un usuario de ese rol (guarda la cookie entre llamadas).
     * Por defecto es admin: puede todo. Las pruebas de permisos piden el rol concreto.
     */
    async agent(name = 'Ana Pruebas', role: Role = 'admin') {
      const user = await createUser(name, role);
      return login(user.email);
    },
    /** Vacía todas las tablas. Úsalo en beforeEach para que cada prueba empiece limpia. */
    async reset() {
      const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
      if (tables.length === 0) return;
      const list = tables.map((t) => `"${t.tablename}"`).join(', ');
      await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
    },
    close: () => app.close(),
  };
}

import type { Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Role } from '@mimark/contracts/session';
import request from 'supertest';
import { configureApp } from '../src/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { Db } from '../src/common/db.js';
import { TEST_ACCESS_CODE } from './env.js';

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

  return {
    db,
    /** Una dependencia de la app, p. ej. para espiar un repositorio con vi.spyOn. */
    get: <T>(token: Type<T>) => app.get(token),
    /** Cliente HTTP sin sesión. */
    http: () => request(server),
    /** Cliente HTTP con sesión iniciada (guarda la cookie entre llamadas). */
    async agent(name = 'Ana Pruebas', role: Role = 'payables') {
      const agent = request.agent(server);
      await agent.post('/api/session').send({ code: TEST_ACCESS_CODE, name, role }).expect(200);
      return agent;
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

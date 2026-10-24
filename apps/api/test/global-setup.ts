import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { TEST_ENV } from './env.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'prisma', 'migrations');

/**
 * Antes de las pruebas de integración: borra el esquema de la base de pruebas y aplica todas
 * las migraciones desde cero. Así cada corrida prueba también que las migraciones aplican.
 */
export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_ENV.DATABASE_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `No hay Postgres de pruebas en ${TEST_ENV.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}.\n` +
        'Levántalo con "pnpm db:up" o define TEST_DATABASE_URL.',
      { cause: error },
    );
  }

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d+_/.test(name))
      .sort();
    for (const name of migrations) {
      await client.query(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

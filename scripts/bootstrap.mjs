#!/usr/bin/env node
/**
 * pnpm bootstrap — deja el entorno local listo en un paso (se puede correr varias veces):
 *   1. crea apps/api/.env desde .env.example si no existe;
 *   2. levanta Postgres con Docker (si hay Docker);
 *   3. aplica las migraciones y carga los datos sintéticos.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const API_ENV = join(ROOT, 'apps/api/.env');

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...options });
  return result.status === 0;
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 22)) {
  console.warn(
    `⚠ Node ${process.versions.node}: el proyecto usa Node 22.22 o superior (ver .nvmrc).`,
  );
}

if (!existsSync(API_ENV)) {
  copyFileSync(join(ROOT, 'apps/api/.env.example'), API_ENV);
  console.log('✔ Creado apps/api/.env desde .env.example');
} else {
  console.log('✔ apps/api/.env ya existe (no se tocó)');
}

const hasDocker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true }).status === 0;
if (hasDocker) {
  if (!run('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', '--wait']))
    process.exit(1);
} else {
  console.warn(
    '\n⚠ No encontré Docker. Usa cualquier Postgres 16 (local o una rama de Neon) y pon su URL en\n' +
      '  DATABASE_URL de apps/api/.env. Para las pruebas de integración define TEST_DATABASE_URL.',
  );
}

const ok =
  run('pnpm', ['--filter', '@mimark/api', 'exec', 'prisma', 'migrate', 'deploy']) &&
  run('pnpm', ['--filter', '@mimark/api', 'run', 'db:seed']);
if (!ok) {
  console.error('\n✖ No se pudo migrar o sembrar la base. Revisa DATABASE_URL en apps/api/.env.');
  process.exit(1);
}

console.log(`
✔ Listo. Siguiente paso:
    pnpm dev        → web en http://localhost:5173 · API en http://localhost:3000/api/health
  Entra con el código de acceso local: mimark-local
`);

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashSecret } from '../src/modules/session/session.rules.js';

/**
 * Usuarios sintéticos para la verificación manual (docs/verificacion-manual.md): `pnpm db:verification-users`.
 * Idempotente. Solo corre contra una base local: nunca crees estas cuentas en un entorno real.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usan las variables del entorno.
}

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('Solo se crean usuarios de verificación en una base local (localhost).');
  process.exit(1);
}

const users = [
  ['verif-compras@pruebas.mx', 'Compras Prueba', 'purchasing', 'Verif-Compras-2026'],
  ['verif-almacen@pruebas.mx', 'Almacén Prueba', 'warehouse', 'Verif-Almacen-2026'],
  ['verif-cxp@pruebas.mx', 'Cuentas por pagar Prueba', 'payables', 'Verif-CxP-2026'],
] as const;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  for (const [email, name, role, password] of users) {
    const data = {
      name,
      role,
      passwordHash: hashSecret(password),
      active: true,
      mustChangePassword: false,
    };
    await db.user.upsert({ where: { email }, create: { email, ...data }, update: data });
  }
  console.log(`Usuarios de verificación listos: ${users.length}.`);
} finally {
  await db.$disconnect();
}

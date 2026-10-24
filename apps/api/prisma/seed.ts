import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Datos sintéticos para la demo y las pruebas manuales: `pnpm db:seed`.
 * Idempotente (upsert). Nunca pongas aquí datos reales de proveedores.
 * Cada spec que necesite datos de demo los agrega aquí; specs/004 y 007 usan estos RFC.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usan las variables del entorno.
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const suppliers = [
  {
    name: 'Distribuidora Alimentos del Norte SA de CV',
    taxId: 'DAN010203AB1',
    creditDays: 15,
    currency: 'MXN',
  },
  {
    name: 'Bebidas Frías de Monterrey SA de CV',
    taxId: 'BFM980512KL3',
    creditDays: 30,
    currency: 'MXN',
  },
  {
    name: 'Empaques y Desechables Regios SA de CV',
    taxId: 'EDR150720QW9',
    creditDays: 7,
    currency: 'MXN',
  },
  { name: 'Café Sierra Madre SC', taxId: 'CSM120304TR5', creditDays: 0, currency: 'MXN' },
  {
    name: 'Importadora Snacks Global SA de CV',
    taxId: 'ISG070809MN2',
    creditDays: 20,
    currency: 'USD',
  },
] as const;

async function main(): Promise<void> {
  for (const supplier of suppliers) {
    await db.supplier.upsert({
      where: { taxId: supplier.taxId },
      create: supplier,
      update: supplier,
    });
  }
  console.log(`Semilla lista: ${suppliers.length} proveedores.`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}

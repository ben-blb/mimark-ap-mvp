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

/** Spec 003. Las specs 004 y 007 usan exactamente estas OC. */
const purchaseOrders = [
  {
    number: 'OC-1001',
    taxId: 'DAN010203AB1',
    issuedOn: '2026-10-01',
    total: '11600.00',
    currency: 'MXN',
    receivedOn: '2026-10-05',
  },
  {
    number: 'OC-1002',
    taxId: 'BFM980512KL3',
    issuedOn: '2026-10-03',
    total: '8352.00',
    currency: 'MXN',
    receivedOn: '2026-10-06',
  },
  {
    number: 'OC-1003',
    taxId: 'EDR150720QW9',
    issuedOn: '2026-10-08',
    total: '3480.00',
    currency: 'MXN',
    receivedOn: null,
  },
  {
    number: 'OC-1004',
    taxId: 'ISG070809MN2',
    issuedOn: '2026-10-02',
    total: '1250.00',
    currency: 'USD',
    receivedOn: '2026-10-09',
  },
  {
    number: 'OC-1005',
    taxId: 'CSM120304TR5',
    issuedOn: '2026-10-12',
    total: '2900.00',
    currency: 'MXN',
    receivedOn: '2026-10-12',
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
  for (const { taxId, receivedOn, ...po } of purchaseOrders) {
    const supplier = await db.supplier.findUniqueOrThrow({ where: { taxId } });
    const data = {
      ...po,
      issuedOn: new Date(po.issuedOn),
      supplierId: supplier.id,
      createdBy: 'Semilla',
      receiptStatus: receivedOn ? ('received' as const) : ('pending' as const),
      receivedOn: receivedOn ? new Date(receivedOn) : null,
      receivedBy: receivedOn ? 'Semilla' : null,
    };
    await db.purchaseOrder.upsert({ where: { number: po.number }, create: data, update: data });
  }
  console.log(
    `Semilla lista: ${suppliers.length} proveedores y ${purchaseOrders.length} órdenes de compra.`,
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}

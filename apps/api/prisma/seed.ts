import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { lineAmount } from '../src/modules/purchase-orders/purchase-orders.rules.js';

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

/** Spec 014. La suma de partidas más 16 % de IVA da el total de cada OC (OC-1004, en USD, va sin IVA). */
const lines: Record<
  string,
  [sku: string, description: string, quantity: string, unit: string, unitPrice: string][]
> = {
  'OC-1001': [
    ['ALI-001', 'Tortilla de harina 1 kg', '100', 'bolsa', '50'],
    ['ALI-014', 'Frijol refrito lata 400 g', '50', 'caja', '100'],
  ],
  'OC-1002': [
    ['BEB-010', 'Refresco cola 600 ml', '120', 'paquete', '30'],
    ['BEB-022', 'Agua mineral 355 ml', '60', 'paquete', '60'],
  ],
  'OC-1003': [
    ['EMP-003', 'Vaso de papel 12 oz', '10', 'caja', '150'],
    ['EMP-007', 'Tapa para vaso 12 oz', '5', 'caja', '200'],
    ['EMP-015', 'Popote biodegradable', '25', 'paquete', '20'],
  ],
  'OC-1004': [
    ['SNK-100', 'Papas fritas 150 g', '50', 'caja', '10'],
    ['SNK-210', 'Cacahuate japonés 200 g', '30', 'caja', '25'],
  ],
  'OC-1005': [
    ['CAF-001', 'Café molido 1 kg', '20', 'bolsa', '100'],
    ['CAF-020', 'Filtros para cafetera', '10', 'caja', '50'],
  ],
};

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
    const order = await db.purchaseOrder.upsert({
      where: { number: po.number },
      create: data,
      update: data,
    });
    await db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: order.id } });
    await db.purchaseOrderLine.createMany({
      data: (lines[po.number] ?? []).map(([sku, description, quantity, unit, unitPrice], i) => ({
        purchaseOrderId: order.id,
        position: i + 1,
        sku,
        description,
        quantity,
        unit,
        unitPrice,
        amount: lineAmount(quantity, unitPrice),
      })),
    });
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

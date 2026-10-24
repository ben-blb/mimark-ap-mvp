import type { Db } from '../src/common/db.js';

/** Proveedores y OC sintéticos de la spec 003 (los mismos de la semilla). */
const SUPPLIERS = [
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

const ORDERS = [
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

/** Inserta los proveedores y las OC del catálogo de pruebas. Úsalo después de `t.reset()`. */
export async function seedCatalog(db: Db): Promise<void> {
  await db.supplier.createMany({ data: [...SUPPLIERS] });
  const suppliers = await db.supplier.findMany();
  const idOf = (taxId: string) => suppliers.find((s) => s.taxId === taxId)!.id;

  await db.purchaseOrder.createMany({
    data: ORDERS.map(({ taxId, receivedOn, ...po }) => ({
      ...po,
      issuedOn: new Date(po.issuedOn),
      supplierId: idOf(taxId),
      createdBy: 'Semilla',
      receiptStatus: receivedOn ? 'received' : 'pending',
      receivedOn: receivedOn ? new Date(receivedOn) : null,
      receivedBy: receivedOn ? 'Semilla' : null,
    })),
  });
}

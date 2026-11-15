import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { seedCatalog } from '../../../test/fixtures.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
type Receipt = {
  id: string;
  number: string;
  supplierName: string;
  receiptStatus: string;
  lines: { id: string; position: number; description: string; quantity: string; unit: string }[];
};

const FORBIDDEN_KEYS = ['unitPrice', 'amount', 'total', 'taxes', 'currency', 'creditDays'];

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('recepciones sin precios (spec 017)', () => {
  let t: TestApp;
  let purchasing: Agent;
  let warehouse: Agent;
  let supplierId: string;

  const body = (number: string, over: Record<string, unknown> = {}) => ({
    number,
    supplierId,
    issuedOn: '2026-10-01',
    total: '1160.00',
    currency: 'MXN',
    lines: [
      { sku: 'VAS-12', description: 'Vaso 12 oz', quantity: '2', unit: 'caja', unitPrice: '500' },
    ],
    ...over,
  });
  const create = async (number: string, over: Record<string, unknown> = {}) =>
    (await purchasing.post('/api/purchase-orders').send(body(number, over)).expect(201)).body as {
      id: string;
      lines: { id: string }[];
    };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    supplierId = (await t.db.supplier.findUniqueOrThrow({ where: { taxId: 'DAN010203AB1' } })).id;
    purchasing = await t.agent('Paco', 'purchasing');
    warehouse = await t.agent('Wanda', 'warehouse');
  });

  it('AC-017-04 lista las órdenes por recibir y filtra por estado y búsqueda', async () => {
    const first = await create('OC-5001');
    await create('OC-5002');
    const cancelled = await create('OC-5003');
    await purchasing
      .patch(`/api/purchase-orders/${cancelled.id}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await warehouse
      .post(`/api/purchase-orders/${first.id}/receipt`)
      .send({ receivedOn: '2026-10-10', checkedLineIds: first.lines.map((l) => l.id) })
      .expect(201);

    const pending = (await warehouse.get('/api/receipts').expect(200)).body.items as Receipt[];
    expect(pending.map((r) => r.number)).toContain('OC-5002');
    expect(pending.map((r) => r.number)).not.toContain('OC-5001');
    expect(pending.map((r) => r.number)).not.toContain('OC-5003');
    expect(pending.find((r) => r.number === 'OC-5002')).toMatchObject({
      supplierName: expect.any(String),
      receiptStatus: 'pending',
    });
    expect(pending.find((r) => r.number === 'OC-5002')?.lines[0]).toMatchObject({
      position: 1,
      sku: 'VAS-12',
      description: 'Vaso 12 oz',
      quantity: '2',
      unit: 'caja',
    });

    const received = (await warehouse.get('/api/receipts?status=received').expect(200)).body
      .items as Receipt[];
    expect(received.map((r) => r.number)).toContain('OC-5001');
    expect(received.map((r) => r.number)).not.toContain('OC-5002');

    const found = (await warehouse.get('/api/receipts?search=5002').expect(200)).body
      .items as Receipt[];
    expect(found).toHaveLength(1);
    expect((await warehouse.get('/api/receipts?search=nada').expect(200)).body.items).toEqual([]);
  });

  it('AC-017-04 una orden se lee por id; una inexistente o cancelada responde 404', async () => {
    const order = await create('OC-5010');
    const one = (await warehouse.get(`/api/receipts/${order.id}`).expect(200)).body as Receipt;
    expect(one.number).toBe('OC-5010');

    const cancelled = await create('OC-5011');
    await purchasing
      .patch(`/api/purchase-orders/${cancelled.id}`)
      .send({ status: 'cancelled' })
      .expect(200);
    for (const id of [cancelled.id, 'no-existe']) {
      const res = await warehouse.get(`/api/receipts/${id}`).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
  });

  it('AC-017-05 la respuesta no contiene precios ni importes en ningún nivel', async () => {
    const order = await create('OC-5020');
    const list = (await warehouse.get('/api/receipts').expect(200)).body;
    const one = (await warehouse.get(`/api/receipts/${order.id}`).expect(200)).body;
    for (const payload of [list, one]) {
      const keys = keysDeep(payload);
      expect(keys.has('description')).toBe(true);
      for (const key of FORBIDDEN_KEYS) expect(keys.has(key), key).toBe(false);
    }
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { seedCatalog } from '../../../test/fixtures.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
type Line = { id: string; position: number; description: string; amount: string };
type Order = { id: string; total: string; taxes: string | null; lines: Line[] };

describe('partidas y checklist de recepción (spec 014)', () => {
  let t: TestApp;
  let agent: Agent;
  let supplierId: string;

  const line = (over: Record<string, unknown> = {}) => ({
    sku: 'VAS-12',
    description: 'Vaso 12 oz',
    quantity: '3',
    unit: 'caja',
    unitPrice: '1250.50',
    ...over,
  });
  const body = (over: Record<string, unknown> = {}) => ({
    number: 'OC-3001',
    supplierId,
    issuedOn: '2026-10-01',
    total: '4351.74', // 3751.50 + 16 %
    currency: 'MXN',
    lines: [line()],
    ...over,
  });
  const create = async (over: Record<string, unknown> = {}) =>
    (await agent.post('/api/purchase-orders').send(body(over)).expect(201)).body as Order;
  const receive = (id: string, checkedLineIds?: string[]) =>
    agent
      .post(`/api/purchase-orders/${id}/receipt`)
      .send({ receivedOn: '2026-10-10', ...(checkedLineIds && { checkedLineIds }) });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    supplierId = (await t.db.supplier.findUniqueOrThrow({ where: { taxId: 'DAN010203AB1' } })).id;
    agent = await t.agent();
  });

  it('AC-014-01 registra la OC con sus partidas en orden y el importe calculado por el servidor', async () => {
    const created = await create({
      total: '5000.00',
      lines: [
        line(),
        line({ description: 'Tapa', quantity: '0.333', unit: 'pza', unitPrice: '10' }),
      ],
    });
    expect(created.lines.map((l) => [l.position, l.description, l.amount])).toEqual([
      [1, 'Vaso 12 oz', '3751.50'],
      [2, 'Tapa', '3.33'],
    ]);

    const fetched = await agent.get(`/api/purchase-orders/${created.id}`).expect(200);
    expect(fetched.body.lines).toHaveLength(2);

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.created' },
    });
    expect((event.data as { after: { lines: unknown[] } }).after.lines).toHaveLength(2);
  });

  it('AC-014-01 una OC sin partidas responde 400 con fieldErrors.lines', async () => {
    const res = await agent
      .post('/api/purchase-orders')
      .send(body({ lines: [] }))
      .expect(400);
    expect(res.body.fieldErrors.lines).toBeDefined();
  });

  it('AC-014-02 señala la partida y el campo inválidos', async () => {
    const res = await agent
      .post('/api/purchase-orders')
      .send(body({ lines: [line(), line(), line({ quantity: '0' })] }))
      .expect(400);
    expect(res.body.fieldErrors['lines.2.quantity']).toBeDefined();
  });

  it('AC-014-03 rechaza un total menor que la suma de las partidas y devuelve los impuestos', async () => {
    const res = await agent
      .post('/api/purchase-orders')
      .send(body({ total: '3000.00' }))
      .expect(400);
    expect(res.body.fieldErrors.total).toBeDefined();

    const created = await create();
    expect(created.taxes).toBe('600.24');
  });

  it('AC-014-04 reemplaza las partidas mientras está pendiente y audita el cambio', async () => {
    const po = await create();
    const updated = await agent
      .patch(`/api/purchase-orders/${po.id}`)
      .send({ lines: [line({ description: 'Tapa', quantity: '10', unitPrice: '5' })] })
      .expect(200);
    expect(updated.body.lines.map((l: Line) => l.description)).toEqual(['Tapa']);
    expect(updated.body.taxes).toBe('4301.74');

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.updated', entityId: po.id },
    });
    const changes = (event.data as { changes: Record<string, unknown> }).changes;
    expect(Object.keys(changes)).toEqual(['lines']);
  });

  it('AC-014-04 revalida el total al cambiar partidas o total, y rechaza editar una OC recibida', async () => {
    const po = await create();
    const tooBig = await agent
      .patch(`/api/purchase-orders/${po.id}`)
      .send({ lines: [line({ quantity: '100' })] })
      .expect(400);
    expect(tooBig.body.fieldErrors.total).toBeDefined();
    await agent.patch(`/api/purchase-orders/${po.id}`).send({ total: '100.00' }).expect(400);

    await receive(
      po.id,
      po.lines.map((l) => l.id),
    ).expect(201);
    const res = await agent
      .patch(`/api/purchase-orders/${po.id}`)
      .send({ lines: [line()] })
      .expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('AC-014-05 exige marcar todas las partidas y ninguna ajena', async () => {
    const po = await create({
      total: '5000.00',
      lines: [line(), line({ description: 'Tapa', unitPrice: '10' })],
    });
    const [a, b] = po.lines.map((l) => l.id) as [string, string];

    const partial = await receive(po.id, [a]).expect(400);
    expect(partial.body.fieldErrors.checkedLineIds).toBeDefined();
    await receive(po.id).expect(400);
    await receive(po.id, [a, b, 'ajena']).expect(400);
    const still = await agent.get(`/api/purchase-orders/${po.id}`).expect(200);
    expect(still.body.receiptStatus).toBe('pending');

    await receive(po.id, [b, a]).expect(201);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.received' },
    });
    expect((event.data as { lineCount: number }).lineCount).toBe(2);
  });

  it('AC-014-06 una OC sin partidas se recibe sin checklist y rechaza ids', async () => {
    const legacy = await t.db.purchaseOrder.findUniqueOrThrow({ where: { number: 'OC-1003' } });
    await t.db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: legacy.id } });

    const withIds = await receive(legacy.id, ['x']).expect(400);
    expect(withIds.body.fieldErrors.checkedLineIds).toBeDefined();
    await receive(legacy.id).expect(201);
  });

  it('AC-014-17 el detalle y la lista traen las partidas', async () => {
    const po = await create();
    const list = await agent.get('/api/purchase-orders?search=OC-3001').expect(200);
    expect(list.body.items[0].lines).toHaveLength(1);
    const detail = await agent.get(`/api/purchase-orders/${po.id}`).expect(200);
    expect(detail.body.lines[0]).toMatchObject({ description: 'Vaso 12 oz', amount: '3751.50' });
  });
});

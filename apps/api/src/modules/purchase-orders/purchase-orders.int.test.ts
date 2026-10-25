import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { seedCatalog } from '../../../test/fixtures.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
type Order = { id: string; number: string };

describe('órdenes de compra (spec 003)', () => {
  let t: TestApp;
  let agent: Agent;
  let supplierId: string; // DAN010203AB1, activo, MXN

  const newOrder = (over: Record<string, unknown> = {}) => ({
    number: 'OC-2001',
    supplierId,
    issuedOn: '2026-10-01',
    total: '5800.00',
    currency: 'MXN',
    ...over,
  });
  const create = async (over: Record<string, unknown> = {}) =>
    (await agent.post('/api/purchase-orders').send(newOrder(over)).expect(201)).body as Order;
  const numbers = (body: { items: Order[] }) => body.items.map((o) => o.number);

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

  it('AC-003-01 registra una OC, se consulta por id y por folio y queda auditada', async () => {
    const created = await agent.post('/api/purchase-orders').send(newOrder()).expect(201);
    expect(created.body).toMatchObject({
      number: 'OC-2001',
      total: '5800.00',
      currency: 'MXN',
      status: 'open',
      receiptStatus: 'pending',
      supplier: { id: supplierId, taxId: 'DAN010203AB1', creditDays: 15 },
    });

    await agent.get(`/api/purchase-orders/${created.body.id}`).expect(200);
    const found = await agent.get('/api/purchase-orders?search=oc-2001').expect(200);
    expect(numbers(found.body)).toEqual(['OC-2001']);

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.created' },
    });
    expect(event).toMatchObject({ actor: 'Ana Pruebas', entityId: created.body.id });
  });

  it('AC-003-02 normaliza el folio y rechaza uno repetido con 409 CONFLICT', async () => {
    const created = await create({ number: '  oc-2001 ' });
    expect(created.number).toBe('OC-2001');

    const dup = await agent.post('/api/purchase-orders').send(newOrder()).expect(409);
    expect(dup.body.code).toBe('CONFLICT');
    expect(dup.body.fieldErrors.number).toBeDefined();
  });

  it('AC-003-03 rechaza proveedor inexistente o inactivo, total inválido y fecha futura', async () => {
    const reject = async (over: Record<string, unknown>, field: string) => {
      const res = await agent.post('/api/purchase-orders').send(newOrder(over)).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.fieldErrors[field]).toBeDefined();
    };
    await reject({ supplierId: 'no-existe' }, 'supplierId');

    await t.db.supplier.update({ where: { id: supplierId }, data: { active: false } });
    await reject({}, 'supplierId');
    await t.db.supplier.update({ where: { id: supplierId }, data: { active: true } });

    await reject({ total: '0' }, 'total');
    await reject({ total: '10.555' }, 'total');
    await reject({ issuedOn: '2999-01-01' }, 'issuedOn');
  });

  it('AC-003-04 confirma la recepción con responsable, notas y evento pending → received', async () => {
    const po = await create();
    const res = await agent
      .post(`/api/purchase-orders/${po.id}/receipt`)
      .send({ receivedOn: '2026-10-05', notes: ' Entrega completa ' })
      .expect(201);
    expect(res.body).toMatchObject({
      receiptStatus: 'received',
      receivedOn: '2026-10-05',
      receivedBy: 'Ana Pruebas',
      receiptNotes: 'Entrega completa',
    });

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.received' },
    });
    expect(event).toMatchObject({ fromStatus: 'pending', toStatus: 'received', entityId: po.id });
    expect(event.data).toEqual({ receivedOn: '2026-10-05', notes: 'Entrega completa' });
  });

  it('AC-003-05 rechaza confirmar dos veces o una OC cancelada, y fechas inválidas', async () => {
    const po = await create();
    const receipt = (id: string, receivedOn: string) =>
      agent.post(`/api/purchase-orders/${id}/receipt`).send({ receivedOn });

    const future = await receipt(po.id, '2999-01-01').expect(400);
    expect(future.body.fieldErrors.receivedOn).toBeDefined();
    const early = await receipt(po.id, '2026-09-30').expect(400);
    expect(early.body.fieldErrors.receivedOn).toBeDefined();

    await receipt(po.id, '2026-10-05').expect(201);
    const again = await receipt(po.id, '2026-10-06').expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');

    const other = await create({ number: 'OC-2002' });
    await agent.patch(`/api/purchase-orders/${other.id}`).send({ status: 'cancelled' }).expect(200);
    const cancelled = await receipt(other.id, '2026-10-05').expect(409);
    expect(cancelled.body.code).toBe('INVALID_TRANSITION');
  });

  it('AC-003-06 filtra por texto, proveedor, recepción y estado; por defecto, abiertas recientes primero', async () => {
    const cancelled = await create({ number: 'OC-2001', issuedOn: '2026-10-15' });
    await agent
      .patch(`/api/purchase-orders/${cancelled.id}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const defaults = await agent.get('/api/purchase-orders').expect(200);
    expect(numbers(defaults.body)).toEqual(['OC-1005', 'OC-1003', 'OC-1002', 'OC-1004', 'OC-1001']);

    const all = await agent.get('/api/purchase-orders?status=all').expect(200);
    expect(numbers(all.body)[0]).toBe('OC-2001');
    const onlyCancelled = await agent.get('/api/purchase-orders?status=cancelled').expect(200);
    expect(numbers(onlyCancelled.body)).toEqual(['OC-2001']);

    const pending = await agent.get('/api/purchase-orders?receipt=pending').expect(200);
    expect(numbers(pending.body)).toEqual(['OC-1003']);
    const received = await agent.get('/api/purchase-orders?receipt=received').expect(200);
    expect(received.body.items).toHaveLength(4);

    const bySupplier = await agent.get(`/api/purchase-orders?supplierId=${supplierId}`).expect(200);
    expect(numbers(bySupplier.body)).toEqual(['OC-1001']);
    const byName = await agent.get('/api/purchase-orders?search=bebidas').expect(200);
    expect(numbers(byName.body)).toEqual(['OC-1002']);
    const byNumber = await agent.get('/api/purchase-orders?search=oc-100').expect(200);
    expect(byNumber.body.items).toHaveLength(5);
  });

  it('AC-003-07 edita la OC y audita los campos que cambiaron', async () => {
    const po = await create();
    const updated = await agent
      .patch(`/api/purchase-orders/${po.id}`)
      .send({ total: '6000.00', parlevelRef: 'PL-77' })
      .expect(200);
    expect(updated.body).toMatchObject({ total: '6000.00', parlevelRef: 'PL-77' });

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.updated' },
    });
    expect(event.data).toEqual({
      changes: {
        total: { from: '5800.00', to: '6000.00' },
        parlevelRef: { from: null, to: 'PL-77' },
      },
    });
  });

  it('AC-003-07 audita también moneda, fecha y cancelación', async () => {
    const po = await create();
    await agent
      .patch(`/api/purchase-orders/${po.id}`)
      .send({ currency: 'USD', issuedOn: '2026-10-02', status: 'cancelled' })
      .expect(200);

    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.updated', entityId: po.id },
    });
    expect(event.data).toEqual({
      changes: {
        currency: { from: 'MXN', to: 'USD' },
        issuedOn: { from: '2026-10-01', to: '2026-10-02' },
        status: { from: 'open', to: 'cancelled' },
      },
    });
  });

  it('responde 404 para una OC que no existe', async () => {
    const res = await agent.get('/api/purchase-orders/no-existe').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    await agent
      .post('/api/purchase-orders/no-existe/receipt')
      .send({ receivedOn: '2026-10-05' })
      .expect(404);
  });
});

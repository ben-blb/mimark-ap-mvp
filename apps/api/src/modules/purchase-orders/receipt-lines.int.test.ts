import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { seedCatalog } from '../../../test/fixtures.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
type Order = {
  id: string;
  receiptStatus: string;
  lines: { id: string; quantity: string; receivedQuantity: string | null }[];
};

/** El UPDATE de relleno, tal como quedó escrito en la migración. */
function backfillSql(): string {
  const dir = new URL('../../../prisma/migrations/', import.meta.url);
  const name = readdirSync(dir).find((n) => n.endsWith('_018_recepcion_por_partida'))!;
  const sql = readFileSync(new URL(`${name}/migration.sql`, dir), 'utf8');
  return sql.slice(sql.indexOf('UPDATE "PurchaseOrderLine"'));
}

describe('recepción por partida con diferencias (spec 018)', () => {
  let t: TestApp;
  let purchasing: Agent;
  let warehouse: Agent;
  let supplierId: string;

  const create = async (number: string, over: Record<string, unknown> = {}) =>
    (
      await purchasing
        .post('/api/purchase-orders')
        .send({
          number,
          supplierId,
          issuedOn: '2026-10-01',
          total: '10000.00',
          currency: 'MXN',
          lines: [
            {
              sku: 'PEP-600',
              description: 'Pepsi 600 ml',
              quantity: '75',
              unit: 'caja',
              unitPrice: '50',
            },
            {
              sku: 'AGU-1',
              description: 'Agua 1 L',
              quantity: '40',
              unit: 'caja',
              unitPrice: '30',
            },
          ],
          ...over,
        })
        .expect(201)
    ).body as Order;
  const receive = (o: Order, quantities: string[], extra: Record<string, unknown> = {}) =>
    warehouse.post(`/api/purchase-orders/${o.id}/receipt`).send({
      receivedOn: '2026-10-10',
      lines: o.lines.map((l, i) => ({ lineId: l.id, receivedQuantity: quantities[i] })),
      ...extra,
    });
  const statusOf = async (o: Order) =>
    (await purchasing.get(`/api/purchase-orders/${o.id}`).expect(200)).body.receiptStatus;

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

  it('AC-018-01 todo completo: received y cada partida guarda lo recibido', async () => {
    const po = await create('OC-6001');
    const res = await receive(po, ['75', '40']).expect(201);
    expect(res.body.receiptStatus).toBe('received');
    expect(res.body.lines.map((l: { receivedQuantity: string }) => l.receivedQuantity)).toEqual([
      '75',
      '40',
    ]);
    const detail = (await purchasing.get(`/api/purchase-orders/${po.id}`).expect(200))
      .body as Order;
    expect(detail.lines.map((l) => l.receivedQuantity)).toEqual(['75', '40']);
  });

  it('AC-018-02 una partida corta con notas: received_with_differences', async () => {
    const po = await create('OC-6002');
    const res = await receive(po, ['70', '40'], { notes: ' Faltaron 5 cajas ' }).expect(201);
    expect(res.body).toMatchObject({
      receiptStatus: 'received_with_differences',
      receiptNotes: 'Faltaron 5 cajas',
    });
    expect(res.body.lines[0].receivedQuantity).toBe('70');
  });

  it('AC-018-03 con diferencias y sin notas: 400 notes y la OC sigue pending', async () => {
    const po = await create('OC-6003');
    const res = await receive(po, ['70', '40']).expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors.notes).toBeDefined();
    expect(await statusOf(po)).toBe('pending');
  });

  it.each([
    ['falta una partida', (o: Order) => [{ lineId: o.lines[0]!.id, receivedQuantity: '75' }]],
    [
      'sobra una ajena',
      (o: Order) => [
        ...o.lines.map((l) => ({ lineId: l.id, receivedQuantity: l.quantity })),
        { lineId: 'ajena', receivedQuantity: '1' },
      ],
    ],
    [
      'repetida',
      (o: Order) => [
        ...o.lines.map((l) => ({ lineId: l.id, receivedQuantity: l.quantity })),
        { lineId: o.lines[0]!.id, receivedQuantity: '1' },
      ],
    ],
    ['negativa', (o: Order) => o.lines.map((l) => ({ lineId: l.id, receivedQuantity: '-1' }))],
    [
      '4 decimales',
      (o: Order) => o.lines.map((l) => ({ lineId: l.id, receivedQuantity: '1.2345' })),
    ],
    [
      'supera lo pedido',
      (o: Order) => o.lines.map((l) => ({ lineId: l.id, receivedQuantity: '76' })),
    ],
    ['todo en 0', (o: Order) => o.lines.map((l) => ({ lineId: l.id, receivedQuantity: '0' }))],
  ])('AC-018-04 rechaza si %s', async (_caso, build) => {
    const po = await create('OC-6004');
    const res = await warehouse
      .post(`/api/purchase-orders/${po.id}/receipt`)
      .send({ receivedOn: '2026-10-10', notes: 'x', lines: build(po) })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fieldErrors.lines).toBeDefined();
    expect(await statusOf(po)).toBe('pending');
  });

  it('AC-018-05 una OC sin partidas se recibe con lines ausente y queda received', async () => {
    const legacy = await t.db.purchaseOrder.findUniqueOrThrow({ where: { number: 'OC-1003' } });
    await t.db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: legacy.id } });
    await warehouse
      .post(`/api/purchase-orders/${legacy.id}/receipt`)
      .send({ receivedOn: '2026-10-10' })
      .expect(201)
      .expect((res) => expect(res.body.receiptStatus).toBe('received'));
  });

  it('AC-018-06 el evento registra toStatus, conteos y las partidas con diferencia', async () => {
    const po = await create('OC-6006');
    await receive(po, ['70', '40'], { notes: 'Faltaron 5' }).expect(201);
    const event = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'purchase_order.received', entityId: po.id },
    });
    expect(event).toMatchObject({ fromStatus: 'pending', toStatus: 'received_with_differences' });
    expect(event.data).toMatchObject({
      lineCount: 2,
      differenceCount: 1,
      differences: [{ lineId: po.lines[0]!.id, ordered: '75', received: '70' }],
    });
  });

  it('AC-018-07 no se recibe dos veces (ni con diferencias), ni una cancelada; no se editan partidas', async () => {
    const po = await create('OC-6007');
    await receive(po, ['70', '40'], { notes: 'Faltaron 5' }).expect(201);
    const again = await receive(po, ['75', '40']).expect(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
    const edit = await purchasing
      .patch(`/api/purchase-orders/${po.id}`)
      .send({
        lines: [{ description: 'Otra', quantity: '1', unit: 'caja', unitPrice: '1' }],
      })
      .expect(409);
    expect(edit.body.code).toBe('INVALID_TRANSITION');

    const other = await create('OC-6008');
    await purchasing
      .patch(`/api/purchase-orders/${other.id}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await receive(other, ['75', '40']).expect(409);

    const future = await receive(await create('OC-6009'), ['75', '40'], {
      receivedOn: '2999-01-01',
    }).expect(400);
    expect(future.body.fieldErrors.receivedOn).toBeDefined();
  });

  it('AC-018-08 los listados filtran por el estado nuevo y traen receivedQuantity', async () => {
    const complete = await create('OC-6010');
    const short = await create('OC-6011');
    const pending = await create('OC-6012');
    await receive(complete, ['75', '40']).expect(201);
    await receive(short, ['70', '40'], { notes: 'Faltaron 5' }).expect(201);

    const numbers = (b: { items: { number: string }[] }) => b.items.map((o) => o.number);
    const diff = await purchasing
      .get('/api/purchase-orders?receipt=received_with_differences')
      .expect(200);
    expect(numbers(diff.body)).toEqual(['OC-6011']);
    const onlyReceived = await purchasing.get('/api/purchase-orders?receipt=received').expect(200);
    expect(numbers(onlyReceived.body)).toContain('OC-6010');
    expect(numbers(onlyReceived.body)).not.toContain('OC-6011');

    const receipts = (status: string) =>
      warehouse.get(`/api/receipts?status=${status}&search=OC-60`).expect(200);
    expect(numbers((await receipts('received')).body).sort()).toEqual(['OC-6010', 'OC-6011']);
    expect(numbers((await receipts('received_with_differences')).body)).toEqual(['OC-6011']);

    const shortRow = (await receipts('received_with_differences')).body.items[0];
    expect(shortRow.lines.map((l: { receivedQuantity: string }) => l.receivedQuantity)).toEqual([
      '70',
      '40',
    ]);
    const pendingRow = (await warehouse.get(`/api/receipts/${pending.id}`).expect(200)).body;
    expect(pendingRow.lines[0].receivedQuantity).toBeNull();
    const poRow = (await purchasing.get(`/api/purchase-orders/${pending.id}`).expect(200)).body;
    expect(poRow.lines[0].receivedQuantity).toBeNull();
  });

  it('AC-018-09 la migración deja las OC ya recibidas con lo recibido igual a lo pedido', async () => {
    // Simula una OC recibida antes de la migración y vuelve a correr el relleno.
    const po = await create('OC-6020');
    await receive(po, ['75', '40']).expect(201);
    await t.db.purchaseOrderLine.updateMany({
      where: { purchaseOrderId: po.id },
      data: { receivedQuantity: null },
    });
    await t.db.$executeRawUnsafe(backfillSql());
    const lines = await t.db.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    for (const l of lines) expect(String(l.receivedQuantity)).toBe(String(l.quantity));
  });
});

import { describe, expect, it } from 'vitest';
import { usePayablesApp } from '../../../test/payables-harness.js';

type Order = {
  id: string;
  number: string;
  linesSubtotal: string;
  receivedSubtotal: string | null;
  progress: { stage: string; invoice: Record<string, string | null> | null };
  lines: { id: string; quantity: string }[];
};

/** Avance de la orden y conciliación contra lo recibido (spec 019). */
describe('avance de la orden y conciliación (spec 019)', () => {
  const h = usePayablesApp();

  // Pepsi 75 × 149.50 = 11,212.50 · Agua 40 × 100 = 4,000.00 → subtotal 15,212.50.
  const create = async (number = 'OC-7001') => {
    const supplier = await h.t.db.supplier.findUniqueOrThrow({ where: { taxId: 'DAN010203AB1' } });
    return (
      await h.agent
        .post('/api/purchase-orders')
        .send({
          number,
          supplierId: supplier.id,
          issuedOn: '2026-10-01',
          total: '17646.50',
          currency: 'MXN',
          lines: [
            {
              sku: 'PEP-600',
              description: 'Pepsi 600 ml',
              quantity: '75',
              unit: 'caja',
              unitPrice: '149.50',
            },
            {
              sku: 'AGU-1',
              description: 'Agua 1 L',
              quantity: '40',
              unit: 'caja',
              unitPrice: '100',
            },
          ],
        })
        .expect(201)
    ).body as Order;
  };
  const receive = (o: Order, quantities: [string, string], notes?: string) =>
    h.agent
      .post(`/api/purchase-orders/${o.id}/receipt`)
      .send({
        receivedOn: '2026-10-10',
        notes,
        lines: o.lines.map((l, i) => ({ lineId: l.id, receivedQuantity: quantities[i] })),
      })
      .expect(201);
  const get = async (o: Order) =>
    (await h.agent.get(`/api/purchase-orders/${o.id}`).expect(200)).body as Order;
  /** Sube una factura de la OC con los importes dados. */
  const invoice = (over: Record<string, unknown>) => {
    h.ai.override = { purchaseOrderNumber: 'OC-7001', ...over };
    return h.created('factura-oc-7001.pdf', String(Math.random()));
  };

  it('AC-019-01 la etapa sigue la tabla en cada paso, también en la lista', async () => {
    const po = await create();
    expect((await get(po)).progress.stage).toBe('to_receive');

    await receive(po, ['75', '40']);
    expect((await get(po)).progress.stage).toBe('to_invoice');

    const doc = await invoice({ subtotal: 15212.5, total: 17646.5 });
    const stageNow = async () => (await get(po)).progress.stage;
    const setStatus = (status: 'confirmed' | 'scheduled' | 'paid' | 'failed' | 'discarded') =>
      h.t.db.payable.update({ where: { id: doc.id }, data: { status } });
    expect(await stageNow()).toBe('in_review');
    await setStatus('failed');
    expect(await stageNow()).toBe('in_review');
    await setStatus('confirmed');
    expect(await stageNow()).toBe('to_schedule');
    await setStatus('scheduled');
    expect(await stageNow()).toBe('scheduled');
    await setStatus('paid');
    expect(await stageNow()).toBe('paid');
    await setStatus('discarded');
    expect(await stageNow()).toBe('to_invoice');

    const list = (await h.agent.get('/api/purchase-orders?search=OC-7001').expect(200)).body
      .items as Order[];
    expect(list[0]!.progress.stage).toBe('to_invoice');
    const byStage = await h.agent.get('/api/purchase-orders?stage=to_invoice').expect(200);
    expect((byStage.body.items as Order[]).map((o) => o.number)).toContain('OC-7001');

    await h.agent.patch(`/api/purchase-orders/${po.id}`).send({ status: 'cancelled' }).expect(200);
    expect((await get(po)).progress.stage).toBe('cancelled');
  });

  it('AC-019-02 el avance trae fechas y estado de la factura, sin importes, y Compras lo ve sin payables:read', async () => {
    const po = await create();
    await receive(po, ['75', '40']);
    expect((await get(po)).progress.invoice).toBeNull();

    const doc = await invoice({ subtotal: 15212.5, total: 17646.5 });
    await h.t.db.payable.update({
      where: { id: doc.id },
      data: {
        status: 'paid',
        scheduledPayOn: new Date('2026-11-05'),
        paidOn: new Date('2026-11-06'),
      },
    });
    const purchasing = await h.t.agent('Paco', 'purchasing');
    const seen = (await purchasing.get(`/api/purchase-orders/${po.id}`).expect(200)).body as Order;
    expect(seen.progress.invoice).toMatchObject({
      payableId: doc.id,
      status: 'paid',
      invoiceNumber: expect.any(String),
      scheduledPayOn: '2026-11-05',
      paidOn: '2026-11-06',
    });
    expect(Object.keys(seen.progress.invoice!).sort()).toEqual(
      ['dueOn', 'invoiceNumber', 'paidOn', 'payableId', 'scheduledPayOn', 'status'].sort(),
    );
    await purchasing.get('/api/payables').expect(403);
  });

  it('AC-019-03 awaitingInvoice trae solo abiertas, recibidas y sin expediente vivo', async () => {
    const waiting = await create('OC-7001');
    const pending = await create('OC-7002');
    const invoiced = await create('OC-7003');
    const withDiff = await create('OC-7004');
    await receive(waiting, ['75', '40']);
    await receive(invoiced, ['75', '40']);
    await receive(withDiff, ['70', '40'], 'Faltaron 5');
    h.ai.override = { purchaseOrderNumber: 'OC-7003' };
    await h.created('factura.pdf', 'otra');

    const res = await h.agent.get('/api/purchase-orders?awaitingInvoice=true').expect(200);
    const numbers = (res.body.items as Order[]).map((o) => o.number);
    expect(numbers).toContain('OC-7001');
    expect(numbers).toContain('OC-7004');
    expect(numbers).not.toContain(pending.number);
    expect(numbers).not.toContain(invoiced.number);
  });

  it('AC-019-04 el subtotal pedido y el recibido salen de las partidas; pendiente es null', async () => {
    const po = await create();
    expect(po).toMatchObject({ linesSubtotal: '15212.50', receivedSubtotal: null });
    await receive(po, ['70', '40'], 'Faltaron 5');
    expect(await get(po)).toMatchObject({
      linesSubtotal: '15212.50',
      receivedSubtotal: '14465.00', // 70 × 149.50 + 4,000.00
    });
  });

  it('AC-019-06 con diferencias, el subtotal de la factura igual al recibido queda por confirmar', async () => {
    const po = await create();
    await receive(po, ['70', '40'], 'Faltaron 5');
    const doc = await invoice({ subtotal: 14465, total: 16779.4 });
    expect(doc.status).toBe('pending_confirmation');
    expect(doc.reviewReasons).toEqual([]);
  });

  it('AC-019-07 con diferencias, facturar todo lo pedido da RECEIVED_AMOUNT_MISMATCH', async () => {
    const po = await create();
    await receive(po, ['70', '40'], 'Faltaron 5');
    const doc = await invoice({ subtotal: 15212.5, total: 17646.5 });
    expect(doc.status).toBe('requires_review');
    expect(doc.reviewReasons).toEqual([{ code: 'RECEIVED_AMOUNT_MISMATCH' }]);
  });

  it('AC-019-08 sin subtotal pide el campo y corregirlo vuelve a evaluar', async () => {
    const po = await create();
    await receive(po, ['70', '40'], 'Faltaron 5');
    const doc = await invoice({ subtotal: null, total: 16779.4 });
    expect(doc.status).toBe('requires_review');
    expect(doc.reviewReasons).toEqual([{ code: 'MISSING_FIELD', field: 'subtotal' }]);

    const fixed = await h.agent
      .patch(`/api/payables/${doc.id}/fields`)
      .send({ subtotal: '14465.00' })
      .expect(200);
    expect(fixed.body.status).toBe('pending_confirmation');
  });

  it('AC-019-05 una orden recibida completa sigue comparando el total', async () => {
    const po = await create();
    await receive(po, ['75', '40']);
    expect((await invoice({ subtotal: 15212.5, total: 17646.5 })).status).toBe(
      'pending_confirmation',
    );
    const other = await create('OC-7005');
    await receive(other, ['75', '40']);
    h.ai.override = { purchaseOrderNumber: 'OC-7005', subtotal: 15212.5, total: 17646.51 };
    const off = await h.created('factura.pdf', 'distinta');
    expect(off.reviewReasons).toEqual([{ code: 'TOTAL_MISMATCH' }]);
  });

  it('AC-019-09 el expediente trae el cuadro de la orden', async () => {
    const po = await create();
    await receive(po, ['70', '40'], 'Faltaron 5');
    const doc = await invoice({ subtotal: 14465, total: 16779.4 });
    expect(doc).toMatchObject({
      purchaseOrder: {
        number: 'OC-7001',
        total: '17646.50',
        linesSubtotal: '15212.50',
        receivedSubtotal: '14465.00',
        receiptStatus: 'received_with_differences',
        receivedOn: '2026-10-10',
        receiptNotes: 'Faltaron 5',
      },
    });
  });
});

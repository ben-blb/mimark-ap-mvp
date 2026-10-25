import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { seedCatalog } from '../../../test/fixtures.js';
import { insertPayable } from '../../../test/payable-rows.js';
import { addDays, toLocalDate } from '../../common/dates.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;

describe('expedientes: filtros de la lista (spec 006)', () => {
  let t: TestApp;
  let agent: Agent;
  const today = toLocalDate(new Date(), 'America/Monterrey');
  const ids = async (query: string) =>
    ((await agent.get(`/api/payables?${query}`).expect(200)).body.items as { id: string }[])
      .map((i) => i.id)
      .sort();
  const sorted = (...list: string[]) => list.sort();

  let norte: string; // supplierId de DAN010203AB1
  let bebidas: string;
  let a: string, b: string, c: string, d: string, e: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedCatalog(t.db);
    agent = await t.agent();
    norte = (await t.db.supplier.findUniqueOrThrow({ where: { taxId: 'DAN010203AB1' } })).id;
    bebidas = (await t.db.supplier.findUniqueOrThrow({ where: { taxId: 'BFM980512KL3' } })).id;
    const oc1001 = (await t.db.purchaseOrder.findUniqueOrThrow({ where: { number: 'OC-1001' } }))
      .id;
    const oc1002 = (await t.db.purchaseOrder.findUniqueOrThrow({ where: { number: 'OC-1002' } }))
      .id;

    a = await insertPayable(t.db, {
      supplierId: norte,
      purchaseOrderId: oc1001,
      poNumber: 'OC-1001',
      invoiceNumber: 'A-100',
      dueOn: addDays(today, -2),
      suggestedPayOn: today,
    });
    b = await insertPayable(t.db, {
      status: 'scheduled',
      supplierId: norte,
      purchaseOrderId: oc1001,
      poNumber: 'OC-1001',
      invoiceNumber: 'A-200',
      dueOn: addDays(today, 5),
      suggestedPayOn: today,
    });
    c = await insertPayable(t.db, {
      supplierId: bebidas,
      purchaseOrderId: oc1002,
      poNumber: 'OC-1002',
      invoiceNumber: 'B-300',
      dueOn: addDays(today, 12),
      suggestedPayOn: today,
    });
    d = await insertPayable(t.db, {
      status: 'requires_review',
      supplierId: bebidas,
      poNumber: 'OC-1002',
      invoiceNumber: 'B-400',
    });
    e = await insertPayable(t.db, {
      status: 'paid',
      supplierId: norte,
      invoiceNumber: 'A-500',
      dueOn: addDays(today, -10),
      suggestedPayOn: today,
      paidOn: today,
    });
  });

  it('AC-006-04 filtra por proveedor, por folio de OC y por número de factura', async () => {
    expect(await ids(`supplierId=${bebidas}`)).toEqual(sorted(c, d));
    expect(await ids('poNumber=oc-1001')).toEqual(sorted(a, b));
    expect(await ids('poNumber=1002')).toEqual(sorted(c, d));
    expect(await ids('invoiceNumber=a-')).toEqual(sorted(a, b, e));
    expect(await ids('invoiceNumber=B-300')).toEqual([c]);
  });

  it('AC-006-04 acepta varios estados a la vez', async () => {
    expect(await ids('status=confirmed,scheduled')).toEqual(sorted(a, b, c));
    expect(await ids('status=requires_review,paid')).toEqual(sorted(d, e));
    expect(await ids('status=scheduled')).toEqual([b]);
  });

  it('AC-006-04 filtra por vencimiento solo lo que sigue por pagar (como el tablero)', async () => {
    expect(await ids('due=overdue')).toEqual([a]); // e está pagado: no cuenta
    expect(await ids('due=7')).toEqual([b]);
    expect(await ids('due=15')).toEqual(sorted(b, c));
    expect(await ids('due=30')).toEqual(sorted(b, c));
  });

  it('AC-006-04 los filtros se combinan: todos deben cumplirse', async () => {
    expect(await ids(`supplierId=${norte}&due=15`)).toEqual([b]);
    expect(await ids(`supplierId=${norte}&status=confirmed,scheduled&poNumber=1001`)).toEqual(
      sorted(a, b),
    );
    expect(await ids(`supplierId=${bebidas}&status=paid`)).toEqual([]);
    expect(await ids(`status=confirmed&due=overdue&invoiceNumber=A-1`)).toEqual([a]);
  });

  it('AC-006-04 rechaza un estado o un vencimiento que no existen', async () => {
    await agent.get('/api/payables?status=confirmed,volando').expect(400);
    await agent.get('/api/payables?due=90').expect(400);
  });

  it('AC-006-04 los totales del tablero cuadran con la lista filtrada por los mismos criterios', async () => {
    const dash = (await agent.get('/api/dashboard?horizon=15').expect(200)).body;
    expect(dash.totals.overdue.count).toBe((await ids('due=overdue')).length);
    expect(dash.totals.upcoming.count).toBe((await ids('due=15')).length);
    expect(dash.totals.pending.count).toBe((await ids('status=confirmed,scheduled')).length);
    expect(dash.items.map((i: { id: string }) => i.id).sort()).toEqual(
      sorted(...(await ids('due=overdue')), ...(await ids('due=15'))),
    );
  });
});

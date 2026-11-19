import type { Prisma } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';

type Entry = Partial<Prisma.LedgerEntryUncheckedCreateInput> & { amount: string };

describe('traspasos entre cuentas propias (spec 023)', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let periodId: string;
  let accountA: string;
  let accountB: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    admin = await t.agent();
    const companyId = (await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } })).id;
    periodId = (await t.db.reportPeriod.create({ data: { companyId, month: '2026-09' } })).id;
    accountA = (await t.db.bankAccount.create({ data: { companyId, name: 'A', type: 'checking' } }))
      .id;
    accountB = (await t.db.bankAccount.create({ data: { companyId, name: 'B', type: 'checking' } }))
      .id;
  });

  const entry = (e: Entry) =>
    t.db.ledgerEntry.create({
      data: {
        periodId,
        date: new Date('2026-09-10'),
        source: 'bank_csv',
        accountId: accountA,
        concept: 'TRASPASO SPEI',
        needsReview: true,
        createdBy: 'Ana Pruebas',
        ...e,
      },
    });
  const pair = async () => ({
    out: await entry({ amount: '-5000.00' }),
    inflow: await entry({ amount: '5000.00', accountId: accountB, date: new Date('2026-09-11') }),
  });
  const confirm = (a: string, b: string) =>
    admin.post('/api/closing/transfers').send({ entryIds: [a, b] });
  const get = (id: string) => t.db.ledgerEntry.findUniqueOrThrow({ where: { id } });

  it('AC-023-06 la cola propone el traspaso y no lo acepta solo', async () => {
    const { out, inflow } = await pair();
    await entry({ amount: '-70.00', concept: 'OTRA' });

    const res = await admin.get('/api/closing/review').query({ periodId }).expect(200);

    expect(res.body.transfers).toEqual([{ entryIds: [out.id, inflow.id] }]);
    const byId = new Map(res.body.items.map((i: { id: string }) => [i.id, i]));
    expect(byId.get(out.id)).toMatchObject({ possibleTransferWith: inflow.id, kind: 'normal' });
    expect(byId.get(inflow.id)).toMatchObject({ possibleTransferWith: out.id });
    expect(await t.db.transferGroup.count()).toBe(0);
    expect((await get(out.id)).needsReview).toBe(true);
  });

  it('AC-023-06 no propone con la misma cuenta, otro monto o fuera de los 2 días hábiles', async () => {
    await entry({ amount: '-100.00' });
    await entry({ amount: '100.00' }); // misma cuenta
    await entry({ amount: '101.00', accountId: accountB }); // otro monto
    await entry({ amount: '100.00', accountId: accountB, date: new Date('2026-09-15') }); // 3 días hábiles
    const res = await admin.get('/api/closing/review').query({ periodId }).expect(200);
    expect(res.body.transfers).toEqual([]);
  });

  it('AC-023-07 confirmar marca ambos como traspaso, fuera de la cola, y suman 0.00', async () => {
    const { out, inflow } = await pair();

    const res = await confirm(out.id, inflow.id).expect(201);

    expect(res.body.entryIds).toEqual([out.id, inflow.id]);
    for (const id of [out.id, inflow.id]) {
      expect(await get(id)).toMatchObject({
        kind: 'internal_transfer',
        transferGroupId: res.body.id,
        needsReview: false,
        categoryId: null,
      });
    }
    const group = await t.db.transferGroup.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(group.confirmedBy).toBe('Ana Pruebas');
    const net = (await t.db.ledgerEntry.findMany({ where: { kind: 'internal_transfer' } })).reduce(
      (total, e) => total + Math.round(Number(e.amount) * 100),
      0,
    );
    expect(net).toBe(0);
    const queue = await admin.get('/api/closing/review').query({ periodId }).expect(200);
    expect(queue.body.items).toEqual([]);
    expect(await t.db.auditEvent.count({ where: { action: 'transfer.confirmed' } })).toBe(1);
  });

  it('AC-023-07 desemparejar los devuelve a la cola y borra el grupo', async () => {
    const { out, inflow } = await pair();
    const { id } = (await confirm(out.id, inflow.id).expect(201)).body;

    await admin.delete(`/api/closing/transfers/${id}`).expect(200);

    for (const e of [out, inflow]) {
      expect(await get(e.id)).toMatchObject({
        kind: 'normal',
        transferGroupId: null,
        needsReview: true,
      });
    }
    expect(await t.db.transferGroup.count()).toBe(0);
    expect(await t.db.auditEvent.count({ where: { action: 'transfer.unpaired' } })).toBe(1);
    await admin.delete(`/api/closing/transfers/${id}`).expect(404);
  });

  it('AC-023-07 confirmar dos movimientos que no son los dos lados de un traspaso es 400', async () => {
    const a = await entry({ amount: '-100.00' });
    const b = await entry({ amount: '100.00' }); // misma cuenta
    const res = await confirm(a.id, b.id).expect(400);
    expect(res.body.fieldErrors.entryIds).toBeDefined();
    await confirm(a.id, a.id).expect(400);
    expect(await t.db.transferGroup.count()).toBe(0);
  });

  it('AC-023-08 un movimiento no puede estar en dos traspasos', async () => {
    const { out, inflow } = await pair();
    const other = await entry({
      amount: '5000.00',
      accountId: accountB,
      date: new Date('2026-09-10'),
    });
    await confirm(out.id, inflow.id).expect(201);

    const res = await confirm(out.id, other.id).expect(409);

    expect(res.body.code).toBe('ALREADY_PAIRED');
    expect(await t.db.transferGroup.count()).toBe(1);
    expect((await get(other.id)).kind).toBe('normal');
  });

  it('AC-023-08 un movimiento ya emparejado no se clasifica a mano', async () => {
    const { out, inflow } = await pair();
    await confirm(out.id, inflow.id).expect(201);
    const cat = await t.db.category.create({
      data: { code: 'RENTAS', name: 'Rentas', edoResLine: 'Rentas', kind: 'expense' },
    });
    const res = await admin
      .patch(`/api/closing/entries/${out.id}`)
      .send({ categoryId: cat.id })
      .expect(409);
    expect(res.body.code).toBe('ALREADY_PAIRED');
  });

  it('AC-023-05 un periodo cerrado rechaza emparejar y desemparejar', async () => {
    const { out, inflow } = await pair();
    const { id } = (await confirm(out.id, inflow.id).expect(201)).body;
    await t.db.reportPeriod.update({ where: { id: periodId }, data: { status: 'closed' } });
    expect((await admin.delete(`/api/closing/transfers/${id}`).expect(409)).body.code).toBe(
      'PERIOD_CLOSED',
    );
    const a = await entry({ amount: '-9.00' });
    const b = await entry({ amount: '9.00', accountId: accountB });
    expect((await confirm(a.id, b.id).expect(409)).body.code).toBe('PERIOD_CLOSED');
  });
});

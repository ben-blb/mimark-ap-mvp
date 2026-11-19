import type { Prisma } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { CLOSING_CATEGORIES } from './closing.catalog.js';

type Entry = Partial<Prisma.LedgerEntryUncheckedCreateInput> & { amount: string };

describe('conciliación, cuadres y cierre (spec 023)', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let periodId: string;
  let accountA: string;
  const cat: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    admin = await t.agent();
    await t.db.category.createMany({ data: [...CLOSING_CATEGORIES] });
    for (const c of await t.db.category.findMany()) cat[c.code] = c.id;
    companyId = (await t.db.company.create({ data: { name: 'Quima', nameKey: 'quima' } })).id;
    periodId = (await t.db.reportPeriod.create({ data: { companyId, month: '2026-09' } })).id;
    accountA = (
      await t.db.bankAccount.create({ data: { companyId, name: 'BBVA', type: 'checking' } })
    ).id;
  });

  const entry = (e: Entry) =>
    t.db.ledgerEntry.create({
      data: {
        periodId,
        date: new Date('2026-09-01'),
        source: 'bank_csv',
        accountId: accountA,
        concept: 'X',
        createdBy: 'Ana Pruebas',
        ...e,
      },
    });
  const sale = (date: string, amount: string) =>
    entry({
      source: 'cantaloupe',
      accountId: null,
      concept: 'Ventas Cantaloupe',
      amount,
      date: new Date(date),
    });
  const deposit = (date: string, amount: string) =>
    entry({
      date: new Date(date),
      amount,
      concept: 'DEPOSITO CANTALOUPE',
      categoryId: cat.COBRANZA_CANTALOUPE,
    });
  const cantaloupe = async () =>
    (await admin.get(`/api/closing/periods/${periodId}/cantaloupe`).expect(200)).body;
  const checks = async () =>
    (await admin.get(`/api/closing/periods/${periodId}/checks`).expect(200)).body.items as {
      id: string;
      status: string;
      valueA: string;
      valueB: string;
      difference: string;
      entryIds: string[];
    }[];

  /** Un mes que cuadra en todo. */
  async function cleanMonth() {
    await entry({
      source: 'parlevel_sales',
      accountId: null,
      amount: '1000.00',
      categoryId: cat.VENTAS,
    });
    await entry({ source: 'payroll', accountId: null, amount: '-300.00', categoryId: cat.NOMINAS });
    await entry({ amount: '-200.00', categoryId: cat.RENTAS });
    await t.db.sourceUpload.create({
      data: {
        periodId,
        source: 'bank_pdf',
        accountId: accountA,
        fileKey: 'k',
        fileName: 'edo.pdf',
        sha256: 'h',
        status: 'confirmed',
        uploadedBy: 'Ana Pruebas',
        rowsRead: 1,
        rowsRejected: 0,
        draft: { openingBalance: '500.00', closingBalance: '300.00', rows: [] },
      },
    });
  }

  it('AC-023-09 AC-023-10 el depósito esperado sale de las ventas, la comisión y su IVA', async () => {
    await sale('2026-09-01', '8336.50');
    await deposit('2026-09-01', '8007.71');

    const res = await cantaloupe();

    expect(res.rate).toBe('0.0340');
    expect(res.items).toEqual([
      {
        date: '2026-09-01',
        groupedDays: [],
        sales: '8336.50',
        commission: '283.44',
        vat: '45.35',
        expected: '8007.71',
        deposit: '8007.71',
        difference: '0.00',
        status: 'ok',
      },
    ]);
  });

  it('AC-023-10 usa la tasa de la empresa', async () => {
    await t.db.company.update({ where: { id: companyId }, data: { cantaloupeRate: '0.0290' } });
    await sale('2026-09-01', '1000.00');
    const res = await cantaloupe();
    expect(res.rate).toBe('0.0290');
    expect(res.items[0]).toMatchObject({ commission: '29.00', vat: '4.64', expected: '966.36' });
  });

  it('AC-023-10 AC-023-11 fin de semana junto, tolerancia, depósito ausente y huérfano', async () => {
    // 2026-09-05 sábado, 06 domingo, 07 lunes
    await sale('2026-09-05', '100.00');
    await sale('2026-09-06', '200.00');
    await deposit('2026-09-07', '289.00'); // esperado 288.17 → diferencia 0.83 → warning
    await sale('2026-09-08', '100.00'); // sin depósito
    await deposit('2026-09-09', '50.00'); // sin ventas
    await sale('2026-09-10', '100.00');
    await deposit('2026-09-10', '96.06'); // exacto

    const { items } = await cantaloupe();

    expect(items.map((i: { date: string; status: string }) => [i.date, i.status])).toEqual([
      ['2026-09-07', 'warning'],
      ['2026-09-08', 'missing'],
      ['2026-09-09', 'orphan'],
      ['2026-09-10', 'ok'],
    ]);
    expect(items[0]).toMatchObject({
      groupedDays: ['2026-09-05', '2026-09-06', '2026-09-07'],
      difference: '0.83',
    });
    await admin.get('/api/closing/periods/no-existe/cantaloupe').expect(404);
  });

  it('AC-023-12 AC-023-13 un mes cuadrado: todos los semáforos en ok, con sus valores', async () => {
    await cleanMonth();
    const list = await checks();
    expect(list.map((c) => [c.id, c.status])).toEqual([
      ['sales', 'ok'],
      [`bank_balance:${accountA}`, 'ok'],
      ['bank_net', 'ok'],
      ['payroll', 'ok'],
      ['uncategorized', 'ok'],
      ['duplicates', 'ok'],
    ]);
    expect(list[0]).toMatchObject({ valueA: '1000.00', valueB: '1000.00', difference: '0.00' });
    expect(list[1]).toMatchObject({ valueA: '300.00', valueB: '300.00' });
  });

  it('AC-023-12 AC-023-13 un egreso sin categoría y un saldo que no cuadra enlazan los movimientos', async () => {
    await cleanMonth();
    const lost = await entry({ amount: '-40.00' });

    const list = await checks();
    const byId = (id: string) => list.find((c) => c.id === id);

    expect(byId('uncategorized')).toMatchObject({
      status: 'error',
      valueA: '-40.00',
      entryIds: [lost.id],
    });
    expect(byId(`bank_balance:${accountA}`)).toMatchObject({
      status: 'error',
      valueA: '260.00',
      valueB: '300.00',
      difference: '-40.00',
    });
    expect(byId(`bank_balance:${accountA}`)?.entryIds).toContain(lost.id);
  });

  it('AC-023-12 sin estado de cuenta en PDF el saldo es warning, nunca ok', async () => {
    await entry({ amount: '-10.00', categoryId: cat.RENTAS });
    const list = await checks();
    expect(list.find((c) => c.id === `bank_balance:${accountA}`)?.status).toBe('warning');
  });

  it('AC-023-14 cerrar exige cero errores y cero por revisar: si no, 409 con la lista', async () => {
    await cleanMonth();
    await entry({ amount: '-40.00' });
    await entry({
      amount: '0.00',
      concept: 'pendiente',
      needsReview: true,
      categoryId: cat.RENTAS,
    });

    const res = await admin.post(`/api/closing/periods/${periodId}/close`).expect(409);

    expect(res.body.code).toBe('CLOSE_BLOCKED');
    expect(res.body.details.pendingReview).toBe(1);
    expect(res.body.details.errors.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining(['uncategorized']),
    );
    expect((await t.db.reportPeriod.findUniqueOrThrow({ where: { id: periodId } })).status).toBe(
      'open',
    );
  });

  it('AC-023-14 cierra cuando todo cuadra, y queda quién y cuándo', async () => {
    await cleanMonth();

    const res = await admin.post(`/api/closing/periods/${periodId}/close`).expect(200);

    expect(res.body).toMatchObject({ id: periodId, status: 'closed', closedBy: 'Ana Pruebas' });
    expect(res.body.closedAt).toBeTruthy();
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'period.closed' } });
    expect(event).toMatchObject({ entityId: periodId, fromStatus: 'open', toStatus: 'closed' });
    await admin.post(`/api/closing/periods/${periodId}/close`).expect(409);
  });

  it('AC-023-15 reabrir exige motivo, queda en auditoría y vuelve a admitir cambios', async () => {
    await cleanMonth();
    await admin.post(`/api/closing/periods/${periodId}/close`).expect(200);

    // Cerrado: ni la 021 ni la 023 escriben.
    const blocked = await admin
      .post('/api/closing/entries')
      .send({ companyId, source: 'cash', date: '2026-09-10', concept: 'Caja', amount: '10.00' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('PERIOD_CLOSED');
    expect((await admin.post(`/api/closing/periods/${periodId}/classify`)).body.code).toBe(
      'PERIOD_CLOSED',
    );

    await admin.post(`/api/closing/periods/${periodId}/reopen`).send({}).expect(400);
    await admin.post(`/api/closing/periods/${periodId}/reopen`).send({ reason: 'ok' }).expect(400);
    const res = await admin
      .post(`/api/closing/periods/${periodId}/reopen`)
      .send({ reason: 'Faltó una nómina' })
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'open',
      reopenReason: 'Faltó una nómina',
      closedAt: null,
    });
    const event = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'period.reopened' } });
    expect(event.data).toEqual({ reason: 'Faltó una nómina' });
    await admin
      .post('/api/closing/entries')
      .send({ companyId, source: 'cash', date: '2026-09-10', concept: 'Caja', amount: '10.00' })
      .expect(201);
    await admin
      .post(`/api/closing/periods/${periodId}/reopen`)
      .send({ reason: 'Otra vez más' })
      .expect(409);
  });

  it('AC-023-16 manager (spec 024) no lee checks, cola, conciliación ni periodos, y tampoco clasifica, empareja, cierra ni reabre', async () => {
    await cleanMonth();
    const e = await entry({ amount: '-1.00', needsReview: true });
    const manager = await t.agent('Gerente', 'manager');

    for (const url of [
      `/api/closing/periods/${periodId}/checks`,
      `/api/closing/periods/${periodId}/cantaloupe`,
      `/api/closing/review?periodId=${periodId}`,
      `/api/closing/periods?companyId=${companyId}&month=2026-09`,
    ]) {
      await manager.get(url).expect(403);
    }
    const attempts = await Promise.all([
      manager.post(`/api/closing/periods/${periodId}/classify`),
      manager.patch(`/api/closing/entries/${e.id}`).send({ categoryId: cat.RENTAS }),
      manager
        .post(`/api/closing/entries/${e.id}/classify-and-rule`)
        .send({ categoryId: cat.RENTAS, pattern: 'xxx' }),
      manager.post('/api/closing/transfers').send({ entryIds: [e.id, 'otro'] }),
      manager.delete('/api/closing/transfers/x'),
      manager.post(`/api/closing/periods/${periodId}/close`),
      manager.post(`/api/closing/periods/${periodId}/reopen`).send({ reason: 'No debería poder' }),
    ]);
    for (const res of attempts) expect(res.status).toBe(403);
    expect((await t.db.ledgerEntry.findUniqueOrThrow({ where: { id: e.id } })).needsReview).toBe(
      true,
    );
  });
});

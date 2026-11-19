import type { Prisma } from '../../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { normalizeKey } from './closing.rules.js';
import { CLOSING_CATEGORIES } from './closing.catalog.js';

type Entry = Partial<Prisma.LedgerEntryUncheckedCreateInput> & { concept: string; amount: string };

describe('clasificación y cola de revisión (spec 023)', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<TestApp['agent']>>;
  let companyId: string;
  let periodId: string;
  let accountA: string;
  let accountB: string;
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
    accountA = (await t.db.bankAccount.create({ data: { companyId, name: 'A', type: 'checking' } }))
      .id;
    accountB = (await t.db.bankAccount.create({ data: { companyId, name: 'B', type: 'checking' } }))
      .id;
  });

  const rule = (pattern: string, code: string, priority = 0) =>
    t.db.classificationRule.create({
      data: {
        pattern,
        patternKey: normalizeKey(pattern),
        categoryId: cat[code] as string,
        priority,
      },
    });
  const entry = (e: Entry) =>
    t.db.ledgerEntry.create({
      data: {
        periodId,
        date: new Date('2026-09-10'),
        source: 'bank_csv',
        accountId: accountA,
        createdBy: 'Ana Pruebas',
        ...e,
      },
    });
  const classify = () => admin.post(`/api/closing/periods/${periodId}/classify`);
  const snapshot = async () =>
    (await t.db.ledgerEntry.findMany({ orderBy: { id: 'asc' } })).map((e) => [
      e.id,
      e.categoryId,
      e.needsReview,
    ]);

  it('AC-023-01 aplica las reglas a los movimientos sin categoría y deja el resto en revisión', async () => {
    await rule('ADT SECURITY', 'SEGURIDAD');
    const hit = await entry({ concept: 'ADT SECURITY CR MU RFC:XXX', amount: '-500.00' });
    const miss = await entry({ concept: 'COMPRA RARA', amount: '-30.00' });

    const res = await classify().expect(200);

    expect(res.body).toEqual({ classified: 1, needsReview: 1 });
    expect(await t.db.ledgerEntry.findUnique({ where: { id: hit.id } })).toMatchObject({
      categoryId: cat.SEGURIDAD,
      needsReview: false,
    });
    expect(await t.db.ledgerEntry.findUnique({ where: { id: miss.id } })).toMatchObject({
      categoryId: null,
      needsReview: true,
    });
    expect(await t.db.auditEvent.count({ where: { action: 'period.classified' } })).toBe(1);
  });

  it('AC-023-01 clasifica por fuente: ventas, mermas, robos y nómina; Cantaloupe no lleva categoría', async () => {
    const sales = await entry({
      source: 'parlevel_sales',
      accountId: null,
      concept: 'Ventas',
      amount: '100.00',
    });
    const waste = await entry({
      source: 'parlevel_waste',
      accountId: null,
      concept: 'Merma',
      amount: '-10.00',
      meta: { kind: 'waste' },
    });
    const theft = await entry({
      source: 'parlevel_waste',
      accountId: null,
      concept: 'Robo',
      amount: '-20.00',
      meta: { kind: 'theft' },
    });
    const pay = await entry({
      source: 'payroll',
      accountId: null,
      concept: 'Ana',
      amount: '-5000.00',
    });
    const cantaloupe = await entry({
      source: 'cantaloupe',
      accountId: null,
      concept: 'Ventas Cantaloupe',
      amount: '80.00',
    });

    const res = await classify().expect(200);

    expect(res.body).toEqual({ classified: 4, needsReview: 0 });
    const code = async (id: string) =>
      (await t.db.ledgerEntry.findUniqueOrThrow({ where: { id } })).categoryId;
    expect(await code(sales.id)).toBe(cat.VENTAS);
    expect(await code(waste.id)).toBe(cat.MERMAS);
    expect(await code(theft.id)).toBe(cat.ROBOS);
    expect(await code(pay.id)).toBe(cat.NOMINAS);
    expect(await code(cantaloupe.id)).toBeNull();
  });

  it('AC-023-01 un kiosko desconocido conserva su aviso aunque la fuente lo clasifique', async () => {
    const e = await entry({
      source: 'parlevel_sales',
      accountId: null,
      concept: 'Ventas',
      amount: '10.00',
      needsReview: true,
    });
    await classify().expect(200);
    expect(await t.db.ledgerEntry.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({
      categoryId: cat.VENTAS,
      needsReview: true,
    });
  });

  it('AC-023-01 correrlo dos veces no cambia nada y no pisa lo clasificado a mano', async () => {
    await rule('ADT SECURITY', 'SEGURIDAD');
    await entry({ concept: 'ADT SECURITY', amount: '-1.00' });
    const manual = await entry({
      concept: 'ADT SECURITY OTRO',
      amount: '-2.00',
      categoryId: cat.GASOLINA,
    });
    await entry({ concept: 'NADA', amount: '-3.00' });

    await classify().expect(200);
    const first = await snapshot();
    const second = await classify().expect(200);

    expect(await snapshot()).toEqual(first);
    expect(second.body).toEqual({ classified: 0, needsReview: 1 });
    expect(
      (await t.db.ledgerEntry.findUniqueOrThrow({ where: { id: manual.id } })).categoryId,
    ).toBe(cat.GASOLINA);
  });

  it('AC-023-01 con varias reglas gana la de mayor prioridad', async () => {
    await rule('ADT', 'GASOLINA', 1);
    await rule('ADT SECURITY', 'SEGURIDAD', 5);
    const e = await entry({ concept: 'ADT SECURITY', amount: '-1.00' });
    await classify().expect(200);
    expect((await t.db.ledgerEntry.findUniqueOrThrow({ where: { id: e.id } })).categoryId).toBe(
      cat.SEGURIDAD,
    );
  });

  it('AC-023-02 la cola trae el concepto como texto, la sugerencia y los filtros', async () => {
    await rule('TELMEX INTERNET', 'SERVICIOS');
    const a = await entry({
      concept: '=CMD() TELMEX mensual',
      amount: '-99.00',
      needsReview: true,
    });
    await entry({ concept: 'OTRA COSA', amount: '-1.00', needsReview: true, accountId: accountB });
    await entry({ concept: 'ya clasificado', amount: '-1.00', categoryId: cat.RENTAS });

    const res = await admin.get('/api/closing/review').query({ periodId }).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.find((i: { id: string }) => i.id === a.id)).toMatchObject({
      concept: '=CMD() TELMEX mensual',
      suggestedCategoryId: cat.SERVICIOS,
      reason: 'no_rule',
    });

    const filtered = await admin
      .get('/api/closing/review')
      .query({ periodId, accountId: accountB })
      .expect(200);
    expect(filtered.body.items.map((i: { concept: string }) => i.concept)).toEqual(['OTRA COSA']);
    await admin.get('/api/closing/review').query({ periodId: 'no-existe' }).expect(404);
  });

  it('AC-023-03 clasificar a mano quita la revisión y audita la categoría anterior y la nueva', async () => {
    const e = await entry({ concept: 'X', amount: '-5.00', needsReview: true });
    const res = await admin
      .patch(`/api/closing/entries/${e.id}`)
      .send({ categoryId: cat.RENTAS })
      .expect(200);
    expect(res.body).toMatchObject({ id: e.id, categoryId: cat.RENTAS, needsReview: false });

    const again = await admin
      .patch(`/api/closing/entries/${e.id}`)
      .send({ categoryId: cat.GASOLINA })
      .expect(200);
    expect(again.body.categoryId).toBe(cat.GASOLINA);
    const events = await t.db.auditEvent.findMany({
      where: { action: 'entry.classified', entityId: e.id },
      orderBy: { at: 'asc' },
    });
    expect(events.map((v) => v.data)).toEqual([
      { from: null, to: cat.RENTAS },
      { from: cat.RENTAS, to: cat.GASOLINA },
    ]);
    await admin.patch(`/api/closing/entries/${e.id}`).send({ categoryId: 'no-existe' }).expect(404);
    await admin
      .patch('/api/closing/entries/no-existe')
      .send({ categoryId: cat.RENTAS })
      .expect(404);
  });

  it('AC-023-03 una categoría desactivada o el movimiento de Cantaloupe se rechazan', async () => {
    await t.db.category.update({ where: { id: cat.RENTAS as string }, data: { active: false } });
    const e = await entry({ concept: 'X', amount: '-5.00' });
    await admin.patch(`/api/closing/entries/${e.id}`).send({ categoryId: cat.RENTAS }).expect(400);
    const c = await entry({ source: 'cantaloupe', accountId: null, concept: 'V', amount: '5.00' });
    await admin
      .patch(`/api/closing/entries/${c.id}`)
      .send({ categoryId: cat.GASOLINA })
      .expect(400);
  });

  it('AC-023-04 clasificar y crear la regla reclasifica los demás en revisión que coinciden', async () => {
    const first = await entry({
      concept: 'PAGO SAMS CLUB 123',
      amount: '-10.00',
      needsReview: true,
    });
    const second = await entry({
      concept: 'compra sams club 456',
      amount: '-20.00',
      needsReview: true,
    });
    const other = await entry({ concept: 'OTRA COSA', amount: '-30.00', needsReview: true });
    const done = await entry({ concept: 'SAMS CLUB 789', amount: '-1.00', categoryId: cat.RENTAS });

    const res = await admin
      .post(`/api/closing/entries/${first.id}/classify-and-rule`)
      .send({ categoryId: cat.COSTO_VENDIDO, pattern: 'sams club' })
      .expect(200);

    expect(res.body).toMatchObject({
      reclassified: 1,
      entry: { id: first.id, categoryId: cat.COSTO_VENDIDO },
    });
    const get = (id: string) => t.db.ledgerEntry.findUniqueOrThrow({ where: { id } });
    expect(await get(second.id)).toMatchObject({
      categoryId: cat.COSTO_VENDIDO,
      needsReview: false,
    });
    expect(await get(other.id)).toMatchObject({ categoryId: null, needsReview: true });
    expect((await get(done.id)).categoryId).toBe(cat.RENTAS);
    expect(await t.db.classificationRule.count({ where: { patternKey: 'sams club' } })).toBe(1);
    expect(await t.db.auditEvent.count({ where: { action: 'rule.created' } })).toBe(1);
    expect(
      await t.db.auditEvent.count({ where: { action: 'entry.classified', entityId: first.id } }),
    ).toBe(1);
  });

  it('AC-023-04 es todo o nada: un patrón que no está en el concepto no crea nada', async () => {
    const e = await entry({ concept: 'PAGO SAMS', amount: '-10.00', needsReview: true });
    const res = await admin
      .post(`/api/closing/entries/${e.id}/classify-and-rule`)
      .send({ categoryId: cat.RENTAS, pattern: 'costco' })
      .expect(400);
    expect(res.body.fieldErrors.pattern).toBeDefined();
    expect(await t.db.classificationRule.count()).toBe(0);
    expect(
      (await t.db.ledgerEntry.findUniqueOrThrow({ where: { id: e.id } })).categoryId,
    ).toBeNull();
  });

  it('AC-023-05 un periodo cerrado rechaza clasificar y cambiar categorías con 409', async () => {
    const e = await entry({ concept: 'X SAMS', amount: '-5.00', needsReview: true });
    await t.db.reportPeriod.update({ where: { id: periodId }, data: { status: 'closed' } });

    const results = await Promise.all([
      classify(),
      admin.patch(`/api/closing/entries/${e.id}`).send({ categoryId: cat.RENTAS }),
      admin
        .post(`/api/closing/entries/${e.id}/classify-and-rule`)
        .send({ categoryId: cat.RENTAS, pattern: 'sams' }),
    ]);
    for (const res of results) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PERIOD_CLOSED');
    }
    expect(await t.db.classificationRule.count()).toBe(0);
  });
});

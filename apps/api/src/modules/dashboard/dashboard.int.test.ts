import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { insertPayable } from '../../../test/payable-rows.js';
import { addDays, toLocalDate } from '../../common/dates.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;
const real = () => toLocalDate(new Date(), 'America/Monterrey');

describe('tablero (spec 006)', () => {
  let t: TestApp;
  let agent: Agent;
  const dashboard = async (query = '') =>
    (await agent.get(`/api/dashboard${query}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    agent = await t.agent();
  });
  afterEach(() => vi.useRealTimers());

  it('AC-006-01 lista lo vencido y lo que vence en el horizonte, ordenado por día de pago, vencidos primero', async () => {
    const today = real();
    const overdue = await insertPayable(t.db, {
      dueOn: addDays(today, -3),
      suggestedPayOn: addDays(today, 5),
    });
    const soon = await insertPayable(t.db, {
      status: 'scheduled',
      dueOn: addDays(today, 2),
      suggestedPayOn: addDays(today, 9),
      scheduledPayOn: addDays(today, 1),
    });
    const far = await insertPayable(t.db, {
      dueOn: addDays(today, 20),
      suggestedPayOn: addDays(today, 18),
    });
    await insertPayable(t.db, { status: 'requires_review' }); // no se paga todavía: no aparece

    const ids = (body: { items: { id: string }[] }) => body.items.map((i) => i.id);
    expect(ids(await dashboard('?horizon=7'))).toEqual([overdue, soon]);
    expect(ids(await dashboard())).toEqual([overdue, soon]); // por defecto 15 días
    expect(ids(await dashboard('?horizon=30'))).toEqual([overdue, soon, far]);

    const body = await dashboard('?horizon=7');
    expect(body.items[0]).toMatchObject({ id: overdue, overdue: true, payOn: addDays(today, 5) });
    expect(body.items[1]).toMatchObject({
      id: soon,
      overdue: false,
      payOn: addDays(today, 1),
      status: 'scheduled',
    });
    expect(body).toMatchObject({ today, horizon: 7 });
  });

  it('AC-006-01 un horizonte que no es 7, 15 o 30 se rechaza', async () => {
    const res = await agent.get('/api/dashboard?horizon=10').expect(400);
    expect(res.body.code).toBe('VALIDATION');
    await t.http().get('/api/dashboard').expect(401);
  });

  it('AC-006-02 totales por moneda sin mezclar, pagado del mes y expedientes en revisión', async () => {
    const today = real();
    const thisMonth = `${today.slice(0, 7)}-01`;
    const lastMonth = addDays(thisMonth, -1);
    await insertPayable(t.db, {
      dueOn: addDays(today, -1),
      suggestedPayOn: today,
      total: '1000.00',
    });
    await insertPayable(t.db, { dueOn: addDays(today, 3), suggestedPayOn: today, total: '500.50' });
    await insertPayable(t.db, {
      dueOn: addDays(today, 4),
      suggestedPayOn: today,
      total: '100.00',
      currency: 'USD',
    });
    await insertPayable(t.db, {
      status: 'paid',
      dueOn: thisMonth,
      suggestedPayOn: thisMonth,
      paidOn: thisMonth,
      total: '200.00',
    });
    await insertPayable(t.db, {
      status: 'paid',
      dueOn: lastMonth,
      suggestedPayOn: lastMonth,
      paidOn: lastMonth,
      total: '999.00',
    });
    await insertPayable(t.db, { status: 'requires_review' });
    await insertPayable(t.db, { status: 'pending_confirmation' });
    await insertPayable(t.db, { status: 'discarded' });

    const { totals, inReview } = await dashboard('?horizon=7');
    expect(totals.pending).toEqual({ count: 3, amount: { MXN: '1500.50', USD: '100.00' } });
    expect(totals.overdue).toEqual({ count: 1, amount: { MXN: '1000.00', USD: '0.00' } });
    expect(totals.upcoming).toEqual({ count: 2, amount: { MXN: '500.50', USD: '100.00' } });
    expect(totals.paidThisMonth).toEqual({ count: 1, amount: { MXN: '200.00', USD: '0.00' } });
    expect(inReview).toBe(2);
  });

  it('AC-006-03 agrupa lo por pagar por día de pago', async () => {
    const today = real();
    const day1 = addDays(today, 3);
    const day2 = addDays(today, 5);
    await insertPayable(t.db, { dueOn: day2, suggestedPayOn: day1, total: '100.00' });
    await insertPayable(t.db, {
      dueOn: day2,
      suggestedPayOn: day1,
      total: '50.00',
      currency: 'USD',
    });
    await insertPayable(t.db, {
      status: 'scheduled',
      dueOn: day2,
      suggestedPayOn: day1,
      scheduledPayOn: day2,
      total: '70.00',
    });

    const { byPayDay } = await dashboard();
    expect(byPayDay).toEqual([
      { payOn: day1, count: 2, amount: { MXN: '100.00', USD: '50.00' } },
      { payOn: day2, count: 1, amount: { MXN: '70.00', USD: '0.00' } },
    ]);
  });

  it('AC-006-05 "hoy" es el de Monterrey: lo que vence hoy no está vencido aunque en UTC ya sea mañana', async () => {
    // 2026-10-21 03:30 UTC son las 21:30 del 20 de octubre en Monterrey.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T03:30:00Z') });
    const id = await insertPayable(t.db, { dueOn: '2026-10-20', suggestedPayOn: '2026-10-21' });
    await insertPayable(t.db, { dueOn: '2026-10-19', suggestedPayOn: '2026-10-21' });

    const body = await dashboard('?horizon=7');
    expect(body.today).toBe('2026-10-20');
    expect(body.totals.overdue.count).toBe(1);
    expect(body.items.find((i: { id: string }) => i.id === id)).toMatchObject({ overdue: false });

    const list = await agent.get('/api/payables?due=overdue').expect(200);
    expect(list.body.items).toHaveLength(1); // el que vence hoy no cuenta como vencido en la lista tampoco
  });
});

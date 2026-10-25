import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../common/dates.js';
import { usePayablesApp, type PayableBody } from '../../../test/payables-harness.js';
import { isPayDay, lastPayDayOnOrBefore, nextPayDayOnOrAfter } from './schedule.rules.js';

const TZ = 'America/Monterrey';
const today = () => toLocalDate(new Date(), TZ);

/** Programar, pagar y dar seguimiento a documentos (spec 005). */
describe('expedientes: vencimiento, pago y documentos (spec 005)', () => {
  const h = usePayablesApp();
  const confirmed = async (name = 'factura.pdf', label = 'uno'): Promise<PayableBody> => {
    const doc = await h.created(name, label);
    return (await h.agent.post(`/api/payables/${doc.id}/confirm`).expect(201)).body as PayableBody;
  };
  const scheduled = async (): Promise<PayableBody> => {
    const doc = await confirmed();
    return (await h.agent.post(`/api/payables/${doc.id}/schedule`).send({}).expect(201))
      .body as PayableBody;
  };
  const events = (id: string) =>
    h.t.db.auditEvent.findMany({
      where: { entityId: id },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    });

  it('AC-005-07 al confirmar calcula vencimiento (recepción + crédito) y pago sugerido', async () => {
    const doc = await confirmed(); // DAN010203AB1: 15 días de crédito, recibido hoy
    const dueOn = addDays(today(), 15);
    const last = lastPayDayOnOrBefore(dueOn);
    expect(doc.status).toBe('confirmed');
    expect(doc.schedule).toEqual({
      dueOn,
      suggestedPayOn: last >= today() ? last : nextPayDayOnOrAfter(today()),
      scheduledPayOn: null,
      urgent: last < today(),
      overdue: false,
    });
    expect(isPayDay(doc.schedule!.suggestedPayOn)).toBe(true);
    expect(doc.allowedActions).toEqual(['schedule', 'documents']);
  });

  it('AC-005-07 una factura recibida hace tiempo queda vencida y urgente', async () => {
    const doc = await h.created('factura.pdf', 'vieja', {
      invoiceReceivedOn: addDays(today(), -30),
    });
    const res = await h.agent.post(`/api/payables/${doc.id}/confirm`).expect(201);
    expect(res.body.schedule).toMatchObject({
      dueOn: addDays(today(), -15),
      urgent: true,
      overdue: true,
    });
    expect(res.body.schedule.suggestedPayOn).toBe(nextPayDayOnOrAfter(today()));
    const confirmedEvent = (await events(doc.id)).find((e) => e.action === 'payable.confirmed');
    expect(confirmedEvent?.data).toMatchObject({ urgent: true });
  });

  it('AC-005-08 programar usa el pago sugerido por defecto y se puede reprogramar', async () => {
    const doc = await confirmed();
    const first = await h.agent.post(`/api/payables/${doc.id}/schedule`).send({}).expect(201);
    expect(first.body).toMatchObject({
      status: 'scheduled',
      schedule: { scheduledPayOn: doc.schedule!.suggestedPayOn },
      allowedActions: ['schedule', 'pay', 'documents'],
    });

    const later = nextPayDayOnOrAfter(addDays(doc.schedule!.suggestedPayOn, 1));
    const again = await h.agent
      .post(`/api/payables/${doc.id}/schedule`)
      .send({ payOn: later })
      .expect(201);
    expect(again.body.schedule.scheduledPayOn).toBe(later);

    const scheduledEvents = (await events(doc.id)).filter((e) => e.action === 'payable.scheduled');
    expect(scheduledEvents).toHaveLength(2);
    expect(scheduledEvents[1]?.data).toMatchObject({
      payOn: later,
      late: later > doc.schedule!.dueOn,
    });
  });

  it('AC-005-08 rechaza un día que no es miércoles o viernes, o ya pasado', async () => {
    const doc = await confirmed();
    let notPayDay = addDays(today(), 1);
    while (isPayDay(notPayDay)) notPayDay = addDays(notPayDay, 1);
    const wrong = await h.agent
      .post(`/api/payables/${doc.id}/schedule`)
      .send({ payOn: notPayDay })
      .expect(400);
    expect(wrong.body.fieldErrors).toHaveProperty('payOn');

    const past = lastPayDayOnOrBefore(addDays(today(), -1));
    await h.agent.post(`/api/payables/${doc.id}/schedule`).send({ payOn: past }).expect(400);
  });

  it('AC-005-08 no se programa desde otro estado', async () => {
    const doc = await h.created();
    const res = await h.agent.post(`/api/payables/${doc.id}/schedule`).send({}).expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('AC-005-09 registrar el pago exige fecha no futura, importe igual al total y referencia', async () => {
    const doc = await scheduled();
    const pay = (body: object) => h.agent.post(`/api/payables/${doc.id}/payment`).send(body);
    const valid = { paidOn: today(), amount: '11600.00', reference: 'SPEI-0001' };

    expect(
      (await pay({ ...valid, amount: '11599.99' }).expect(400)).body.fieldErrors,
    ).toHaveProperty('amount');
    expect(
      (await pay({ ...valid, paidOn: addDays(today(), 1) }).expect(400)).body.fieldErrors,
    ).toHaveProperty('paidOn');
    expect((await pay({ ...valid, reference: 'x' }).expect(400)).body.fieldErrors).toHaveProperty(
      'reference',
    );

    const res = await pay(valid).expect(201);
    expect(res.body).toMatchObject({
      status: 'paid',
      payment: { paidOn: today(), amount: '11600.00', reference: 'SPEI-0001' },
      allowedActions: ['documents'],
    });
    const paid = (await events(doc.id)).find((e) => e.action === 'payable.paid');
    expect(paid).toMatchObject({ fromStatus: 'scheduled', toStatus: 'paid' });
    expect(paid?.data).toMatchObject({ amount: '11600.00', reference: 'SPEI-0001' });
  });

  it('AC-005-09 solo se paga un expediente programado', async () => {
    const doc = await confirmed();
    const res = await h.agent
      .post(`/api/payables/${doc.id}/payment`)
      .send({ paidOn: today(), amount: '11600.00', reference: 'SPEI-0001' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('AC-005-10 al confirmar, factura recibida y complemento pendiente (proveedor a crédito)', async () => {
    const doc = await confirmed();
    expect(doc.documents).toEqual({ invoice: 'received', complement: 'pending' });
  });

  it('AC-005-10 un ticket deja la factura pendiente y un proveedor de contado no tiene complemento', async () => {
    h.ai.override = { documentType: 'ticket', taxUuid: null };
    const ticket = await confirmed('factura.pdf', 'ticket');
    expect(ticket.documents).toEqual({ invoice: 'pending', complement: 'pending' });

    h.ai.override = {
      supplierTaxId: 'CSM120304TR5',
      purchaseOrderNumber: 'OC-1005',
      subtotal: 2500,
      taxes: 400,
      total: 2900,
    };
    const cash = await confirmed('factura.pdf', 'contado');
    expect(cash.documents).toEqual({ invoice: 'received', complement: null });
  });

  it('AC-005-10 factura y complemento se marcan después, también en un expediente pagado', async () => {
    const doc = await scheduled();
    await h.agent
      .post(`/api/payables/${doc.id}/payment`)
      .send({ paidOn: today(), amount: '11600.00', reference: 'SPEI-0002' })
      .expect(201);

    const res = await h.agent
      .patch(`/api/payables/${doc.id}/documents`)
      .send({ complementStatus: 'received' })
      .expect(200);
    expect(res.body.documents).toEqual({ invoice: 'received', complement: 'received' });
    expect(res.body.status).toBe('paid');

    const back = await h.agent
      .patch(`/api/payables/${doc.id}/documents`)
      .send({ invoiceDocStatus: 'pending' })
      .expect(200);
    expect(back.body.documents.invoice).toBe('pending');
    const changes = (await events(doc.id)).filter((e) => e.action === 'payable.documents');
    expect(changes[0]?.data).toMatchObject({
      changes: { complementStatus: { from: 'pending', to: 'received' } },
    });
  });

  it('AC-005-10 no se marcan documentos antes de confirmar', async () => {
    const doc = await h.created();
    await h.agent
      .patch(`/api/payables/${doc.id}/documents`)
      .send({ complementStatus: 'received' })
      .expect(409);
  });

  it('AC-005-12 allowedActions del DTO sigue la tabla en todo el flujo', async () => {
    const doc = await h.created('sin-oc.pdf');
    expect(doc.allowedActions).toEqual(['correct', 'discard']);
    const fixed = await h.agent
      .patch(`/api/payables/${doc.id}/fields`)
      .send({ poNumber: 'OC-1002' })
      .expect(200);
    expect(fixed.body.allowedActions).toEqual(['correct', 'confirm', 'discard']);
    const conf = await h.agent.post(`/api/payables/${doc.id}/confirm`).expect(201);
    expect(conf.body.allowedActions).toEqual(['schedule', 'documents']);
    const sched = await h.agent.post(`/api/payables/${doc.id}/schedule`).send({}).expect(201);
    expect(sched.body.allowedActions).toEqual(['schedule', 'pay', 'documents']);
    const paid = await h.agent
      .post(`/api/payables/${doc.id}/payment`)
      .send({ paidOn: today(), amount: '8352.00', reference: 'SPEI-0003' })
      .expect(201);
    expect(paid.body.allowedActions).toEqual(['documents']);
    expect((await events(doc.id)).every((e) => e.requestId.length > 0)).toBe(true);
  });
});

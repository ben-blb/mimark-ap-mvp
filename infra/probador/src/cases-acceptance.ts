import { expectedSchedule } from './schedule.js';
import { invoice, renderOtherPdf } from './fixtures.js';
import type { PayableView } from './api.js';
import { type Case, describe, fail, has, reviewCase, send, upload } from './case-kit.js';

/** Casos de aceptación CA-01…CA-06. */
export const ACCEPTANCE_CASES: Case[] = [
  {
    id: 'CA-01',
    title: 'Factura válida',
    run: async (ctx) => {
      const expected = 'pending_confirmation, sin razones';
      const { res, bytes } = await send(
        ctx,
        invoice(ctx.ids, 'ca01', 'norte', { oc: ctx.oc }),
        'ca01',
      );
      if (res.status !== 201)
        return fail(expected, res, `HTTP ${res.status} ${res.body.code ?? ''}`.trim());
      ctx.ca01 = { id: res.body.id, bytes };
      const ok = res.body.status === 'pending_confirmation' && res.body.reviewReasons.length === 0;
      return {
        expected,
        observed: describe(res.body),
        state: res.body.status,
        ref: res.ref,
        pass: ok,
      };
    },
  },
  reviewCase(
    'CA-02',
    'Factura con la OC tachada',
    'requires_review, MISSING_FIELD:purchaseOrderNumber, poNumber = null',
    (ctx) => invoice(ctx.ids, 'ca02', 'bebidas', { oc: 'tachada', subtotal: 7200 }),
    (p) =>
      p.status === 'requires_review' &&
      has(p, 'MISSING_FIELD:purchaseOrderNumber') &&
      p.fields.poNumber === null,
  ),
  {
    id: 'CA-03',
    title: 'Recibo de nómina',
    run: async (ctx) => {
      const expected = 'out_of_scope, campos de factura null';
      const res = await upload(
        ctx,
        await renderOtherPdf('nomina', ctx.ids.run),
        'probador-ca03-nomina.pdf',
      );
      if (res.status !== 201)
        return fail(expected, res, `HTTP ${res.status} ${res.body.code ?? ''}`.trim());
      const f = res.body.fields;
      const empty = f.supplierTaxId === null && f.invoiceNumber === null && f.total === null;
      return {
        expected,
        observed: `${describe(res.body)}${empty ? ', campos null' : ', con campos de factura'}`,
        state: res.body.status,
        ref: res.ref,
        pass: res.body.status === 'out_of_scope' && has(res.body, 'NOT_AP_DOCUMENT') && empty,
      };
    },
  },
  {
    id: 'CA-04',
    title: 'Factura duplicada',
    run: async (ctx) => {
      const expected = 'requires_review con DUPLICATE';
      if (!ctx.ca01)
        return {
          expected,
          observed: 'CA-01 no subió su factura',
          state: 'sin datos',
          ref: 'n/a',
          pass: false,
        };
      const res = await upload(ctx, ctx.ca01.bytes, 'probador-ca04-duplicada.pdf');
      if (res.status !== 201)
        return fail(expected, res, `HTTP ${res.status} ${res.body.code ?? ''}`.trim());
      return {
        expected,
        observed: describe(res.body),
        state: res.body.status,
        ref: res.ref,
        pass: res.body.status === 'requires_review' && has(res.body, 'DUPLICATE'),
      };
    },
  },
  reviewCase(
    'CA-05',
    'Total distinto al de la OC',
    'requires_review, TOTAL_MISMATCH',
    (ctx) => invoice(ctx.ids, 'ca05', 'bebidas', { subtotal: 7355.17 }),
    (p) => p.status === 'requires_review' && has(p, 'TOTAL_MISMATCH'),
  ),
  {
    id: 'CA-06',
    title: 'Confirmar y calcular vencimiento',
    run: async (ctx) => {
      const expected =
        'confirmed con dueOn y suggestedPayOn del calendario (recepción + crédito; miércoles o viernes)';
      if (!ctx.ca01)
        return {
          expected,
          observed: 'CA-01 no subió su factura',
          state: 'sin datos',
          ref: 'n/a',
          pass: false,
        };
      const res = await ctx.api.post<PayableView & { code?: string }>(
        `/api/payables/${ctx.ca01.id}/confirm`,
      );
      if (res.status !== 201 || !res.body.schedule || !res.body.supplier) {
        return {
          expected,
          observed: `HTTP ${res.status} ${res.body.code ?? ''}`.trim(),
          state: `HTTP ${res.status}`,
          ref: res.ref,
          pass: false,
        };
      }
      const want = expectedSchedule(ctx.today, res.body.supplier.creditDays, ctx.today);
      const got = res.body.schedule;
      return {
        expected: `${expected}: vence ${want.dueOn}, pago ${want.suggestedPayOn}`,
        observed: `${res.body.status}, vence ${got.dueOn}, pago ${got.suggestedPayOn}`,
        state: res.body.status,
        ref: res.ref,
        pass:
          res.body.status === 'confirmed' &&
          got.dueOn === want.dueOn &&
          got.suggestedPayOn === want.suggestedPayOn,
      };
    },
  },
];

import type { Api, PayableView, Resp } from './api.js';
import type { CaseResult } from './report.js';
import { type InvoiceDoc, newRun, renderInvoicePdf } from './fixtures.js';

/** Los 12 casos de aceptación (CA) y de seguridad (PS). Cada uno ejecuta y verifica sobre la API desplegada. */

export interface Ctx {
  api: Api;
  ids: ReturnType<typeof newRun>;
  /** "Hoy" en Monterrey, para el oráculo del calendario de pagos. */
  today: string;
  /** Ids de expedientes que esta corrida creó (se descartan al final). */
  created: string[];
  /** OC propia de esta corrida (proveedor DAN, recibida): así lo que se confirma no estorba a la siguiente corrida. */
  oc: string;
  /** Estado que comparten CA-01, CA-04 y CA-06. */
  ca01?: { id: string; bytes: Uint8Array };
}

export interface Outcome {
  expected: string;
  observed: string;
  state: string;
  ref: string;
  pass: boolean;
}

export interface Case {
  id: string;
  title: string;
  run: (ctx: Ctx) => Promise<Outcome>;
}

export type Uploaded = Resp<PayableView & { code?: string; details?: { payableId?: string } }>;

export const reasonsOf = (p: PayableView) =>
  p.reviewReasons.map((r) => (r.field ? `${r.code}:${r.field}` : r.code));
export const describe = (p: PayableView) =>
  `${p.status}, ${reasonsOf(p).join(', ') || 'sin razones'}`;

export async function send(
  ctx: Ctx,
  doc: InvoiceDoc,
  tag: string,
): Promise<{ res: Uploaded; bytes: Uint8Array }> {
  const bytes = await renderInvoicePdf(doc);
  return { res: await upload(ctx, bytes, `probador-${tag}.pdf`), bytes };
}

export async function upload(ctx: Ctx, bytes: Uint8Array, fileName: string): Promise<Uploaded> {
  const res = await ctx.api.upload(bytes, fileName);
  const id = res.body.id ?? res.body.details?.payableId;
  if (id) ctx.created.push(id);
  return res;
}

export const fail = (expected: string, res: Uploaded, why: string): Outcome => ({
  expected,
  observed: why,
  state: `HTTP ${res.status}`,
  ref: res.ref,
  pass: false,
});

/** Casos que suben una factura y comparan estado y razones. */
export function reviewCase(
  id: string,
  title: string,
  expected: string,
  build: (ctx: Ctx) => InvoiceDoc | Promise<InvoiceDoc>,
  check: (p: PayableView) => boolean,
): Case {
  return {
    id,
    title,
    run: async (ctx) => {
      const { res } = await send(ctx, await build(ctx), id.toLowerCase());
      if (res.status !== 201)
        return fail(expected, res, `HTTP ${res.status} ${res.body.code ?? ''}`.trim());
      return {
        expected,
        observed: describe(res.body),
        state: res.body.status,
        ref: res.ref,
        pass: check(res.body),
      };
    },
  };
}

export const has = (p: PayableView, code: string) => reasonsOf(p).includes(code);

export async function countMine(ctx: Ctx): Promise<number> {
  const res = await ctx.api.get<{ items: unknown[] }>('/api/payables?createdBy=probador');
  return res.body.items.length;
}

export function toCaseResult(c: Case, outcome: Outcome, ms: number): CaseResult {
  return { id: c.id, title: c.title, ...outcome, ms };
}

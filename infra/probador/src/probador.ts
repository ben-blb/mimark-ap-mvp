import { CASES, toCaseResult, type Ctx } from './cases.js';
import { connect, discardIds, discardLeftovers, writeEvidence } from './cli.js';
import { newRun } from './fixtures.js';
import { formatProbadorReport, type CaseResult } from './report.js';
import { addDays, localDate } from './schedule.js';

/**
 * `pnpm probador --url <URL>` (código de acceso en PROBADOR_CODE). Ejecuta CA-01…CA-06 y PS-01…PS-06 contra la
 * app y escribe docs/entrega/evidencia/probador.txt. Sale con código 1 si algún caso falla.
 */
async function main(): Promise<void> {
  const { api, url } = await connect();
  const ids = newRun();
  const today = localDate(new Date(), 'America/Monterrey');

  const leftovers = await discardLeftovers(api);
  if (leftovers > 0)
    console.log(`Se descartaron ${leftovers} expedientes de una corrida anterior.`);

  // OC propia de esta corrida: CA-06 confirma una factura y un confirmado ya no se puede descartar; así no
  // ocupa la OC-1001 de la semilla para la siguiente corrida.
  const oc = await createRunOrder(api, ids.run, today);
  const ctx: Ctx = { api, ids, today, created: [], oc: oc.number };

  const results: CaseResult[] = [];
  for (const c of CASES) {
    const started = Date.now();
    try {
      results.push(toCaseResult(c, await c.run(ctx), Date.now() - started));
    } catch (error) {
      results.push(
        toCaseResult(
          c,
          {
            expected: '(el caso debía ejecutarse)',
            observed: `error: ${error instanceof Error ? error.message : String(error)}`,
            state: 'error',
            ref: 'n/a',
            pass: false,
          },
          Date.now() - started,
        ),
      );
    }
    const last = results.at(-1)!;
    console.log(`${last.pass ? 'PASS' : 'FAIL'}  ${last.id}  ${last.title}`);
  }

  const discarded = await discardIds(api, ctx.created);
  await api.patch(`/api/purchase-orders/${oc.id}`, { status: 'cancelled' });
  console.log(
    `Limpieza: ${discarded} expedientes descartados; la OC ${oc.number} quedó cancelada.`,
  );

  const path = await writeEvidence(
    'probador.txt',
    formatProbadorReport(results, { url, at: new Date().toISOString() }),
  );
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} PASS · evidencia en ${path}`);
  process.exit(failed > 0 ? 1 : 0);
}

async function createRunOrder(api: Parameters<typeof discardIds>[0], run: string, today: string) {
  const suppliers = await api.get<{ items: { id: string; taxId: string }[] }>('/api/suppliers');
  const supplier = suppliers.body.items.find((s) => s.taxId === 'DAN010203AB1');
  if (!supplier)
    throw new Error('Falta el proveedor DAN010203AB1: corre `pnpm db:seed` en esa base.');
  const created = await api.post<{ id: string; number: string }>('/api/purchase-orders', {
    number: `OC-P${run}`,
    supplierId: supplier.id,
    issuedOn: addDays(today, -30),
    total: '11600.00',
    currency: 'MXN',
  });
  if (created.status !== 201)
    throw new Error(`No se pudo crear la OC de la corrida (HTTP ${created.status}).`);
  await api.post(`/api/purchase-orders/${created.body.id}/receipt`, {
    receivedOn: addDays(today, -25),
  });
  return created.body;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});

import type { PayableView } from './api.js';
import { connect, discardIds, discardLeftovers, writeEvidence } from './cli.js';
import { buildEvalSet, newRun } from './fixtures.js';
import { formatEvalReport } from './report.js';
import { EVAL_FIELDS, scoreEval, type EvalResult, type FieldValues } from './score.js';

/**
 * `pnpm eval --url <URL>` (código de acceso en PROBADOR_CODE). Sube 30 documentos sintéticos, compara cada campo
 * con su valor esperado y escribe docs/entrega/evidencia/eval.md. Descarta lo que subió.
 * La cuota diaria aplica: para 30 documentos conviene un entorno con DAILY_AI_LIMIT=100.
 */
async function main(): Promise<void> {
  const { api, url } = await connect();
  const leftovers = await discardLeftovers(api);
  if (leftovers > 0)
    console.log(`Se descartaron ${leftovers} expedientes de una corrida anterior.`);

  const set = await buildEvalSet(newRun());
  const results: EvalResult[] = [];
  const created: string[] = [];
  let model = 'desconocido';
  let promptVersion = 'desconocido';

  for (const doc of set) {
    const res = await api.upload(doc.bytes, doc.fileName);
    const body = res.body;
    const id = body.id ?? body.details?.payableId;
    if (id) created.push(id);
    const ok = res.status === 201;
    if (ok && body.extraction) {
      model = body.extraction.model;
      promptVersion = body.extraction.promptVersion;
    }
    results.push({
      id: doc.id,
      kind: doc.kind,
      expected: doc.expected,
      outOfScope: doc.outOfScope,
      actual: ok ? { fields: pick(body), status: body.status } : null,
    });
    console.log(`${doc.id}  ${ok ? body.status : `HTTP ${res.status} ${body.code ?? ''}`}`);
  }

  const discarded = await discardIds(api, created);
  console.log(`Limpieza: ${discarded} expedientes descartados.`);

  const score = scoreEval(results);
  const md = formatEvalReport(score, {
    url,
    at: new Date().toISOString(),
    model,
    promptVersion,
    documents: set.length,
  });
  const path = await writeEvidence('eval.md', md);
  console.log(
    `\nExactitud global ${(score.overall * 100).toFixed(1)} % · inventados ${score.invented.length} · ` +
      `fuera de alcance ${score.outOfScope.detected}/${score.outOfScope.total} · ` +
      `${score.meetsGoal ? 'cumple' : 'NO cumple'} la meta\nEvidencia en ${path}`,
  );
  process.exit(score.meetsGoal ? 0 : 1);
}

function pick(p: PayableView): FieldValues {
  return Object.fromEntries(EVAL_FIELDS.map((f) => [f, p.fields[f] ?? null])) as FieldValues;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});

import { EVAL_FIELDS, type EvalScore } from './score.js';

/** Formatea la evidencia (texto y markdown). Puro: la hora y la URL llegan como datos. */

export interface CaseResult {
  id: string;
  title: string;
  expected: string;
  observed: string;
  /** Estado del expediente (o del HTTP) con el que terminó el caso. */
  state: string;
  /** Referencia para buscar la petición en los logs (x-vercel-id o requestId). */
  ref: string;
  ms: number;
  pass: boolean;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const pct = (value: number) => `${(value * 100).toFixed(1)} %`;

export function formatProbadorReport(
  results: CaseResult[],
  meta: { url: string; at: string },
): string {
  const lines = ['PROBADOR MIMARK AP', `URL:   ${meta.url}`, `Fecha: ${meta.at}`, ''];
  for (const r of results) {
    lines.push(
      `[${r.id}] ${r.title}`,
      `  esperado:  ${r.expected}`,
      `  observado: ${r.observed}`,
      `  estado:    ${r.state} · ref ${r.ref} · ${seconds(r.ms)}`,
      `  resultado: ${r.pass ? 'PASS' : 'FAIL'}`,
      '',
    );
  }
  const passed = results.filter((r) => r.pass).length;
  const noun = results.length === 1 ? 'caso' : 'casos';
  lines.push(
    `Resumen: ${results.length} ${noun} · ${passed} PASS · ${results.length - passed} FAIL`,
  );
  return `${lines.join('\n')}\n`;
}

export function formatEvalReport(
  score: EvalScore,
  meta: { url: string; at: string; model: string; promptVersion: string; documents: number },
): string {
  const lines = [
    '# Evaluación de exactitud de la IA',
    '',
    `- URL: ${meta.url}`,
    `- Fecha: ${meta.at}`,
    `- Modelo: ${meta.model}`,
    `- Prompt: ${meta.promptVersion}`,
    `- Documentos: ${meta.documents}`,
    '',
    '## Exactitud por campo',
    '',
    '| Campo | Aciertos | Esperados | Exactitud |',
    '| --- | --- | --- | --- |',
    ...EVAL_FIELDS.map((f) => {
      const s = score.fields[f];
      return `| ${f} | ${s.hits} | ${s.expected} | ${pct(s.accuracy)} |`;
    }),
    '',
    `Exactitud global: ${pct(score.overall)}`,
    '',
    '## Valores inventados',
    '',
    `Valores inventados: ${score.invented.length}`,
    ...score.invented.map(
      (i) => `- ${i.id} · ${i.field}: se esperaba vacío y salió «${i.observed}»`,
    ),
    '',
    '## Documentos fuera de alcance',
    '',
    `Fuera de alcance detectados: ${score.outOfScope.detected} de ${score.outOfScope.total}`,
    ...score.outOfScope.missed.map((id) => `- No detectado: ${id}`),
    '',
  ];
  if (score.noResponse.length > 0) {
    lines.push('## Sin respuesta', '', ...score.noResponse.map((id) => `- ${id}`), '');
  }
  if (score.failures.length > 0) {
    lines.push(
      '## Fallas',
      '',
      '| Documento | Campo | Esperado | Observado |',
      '| --- | --- | --- | --- |',
      ...score.failures.map((f) => `| ${f.id} | ${f.field} | ${f.expected} | ${f.observed} |`),
      '',
    );
  }
  lines.push(
    '## Meta de calidad',
    '',
    '≥ 95 % de exactitud por campo, 0 valores inventados y 100 % de documentos fuera de alcance detectados.',
    '',
    score.meetsGoal ? '**Resultado: cumple la meta.**' : '**Resultado: NO cumple la meta.**',
  );
  return `${lines.join('\n')}\n`;
}

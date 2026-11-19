import { connect, fatal, writeEvidence } from './cli.js';
import {
  buildStatement,
  renderStatementPdf,
  scoreStatement,
  type BankStatement,
} from './bank-statement.js';

/**
 * `pnpm eval:bank --url <URL>` (usuario con permiso `reports:write` en PROBADOR_EMAIL y PROBADOR_PASSWORD).
 * Sube un estado de cuenta sintético a la primera empresa con una cuenta de banco, compara cada fila con lo esperado,
 * escribe docs/entrega/evidencia/eval-bank.md y descarta la carga (nunca confirma).
 */
interface DraftBody {
  upload: { id: string };
  openingBalance: string;
  closingBalance: string;
  rows: {
    date: string;
    concept: string;
    withdrawal: string | null;
    deposit: string | null;
    balance: string | null;
  }[];
  balanceCheck: { ok: boolean; difference: string };
}

async function main(): Promise<void> {
  const { api, url } = await connect();
  const companies = await api.get<{ items: { id: string }[] }>('/api/closing/companies');
  let target: { companyId: string; accountId: string } | null = null;
  for (const company of companies.body?.items ?? []) {
    const accounts = await api.get<{ items: { id: string }[] }>(
      `/api/closing/accounts?companyId=${company.id}`,
    );
    const first = accounts.body?.items?.[0];
    if (first) {
      target = { companyId: company.id, accountId: first.id };
      break;
    }
  }
  if (!target) fatal('No hay una empresa con cuenta de banco para probar.');

  const month = '2026-09';
  const expected = buildStatement(month);
  const pdf = await renderStatementPdf(expected);
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...target, month })) form.append(key, value);
  form.append(
    'file',
    new Blob([Buffer.from(pdf)], { type: 'application/pdf' }),
    'estado-sintetico.pdf',
  );
  const res = await api.request<DraftBody>('POST', '/api/closing/uploads/bank-pdf', { form });

  let actual: BankStatement | null = null;
  if (res.status === 201) {
    actual = {
      opening: res.body.openingBalance,
      closing: res.body.closingBalance,
      rows: res.body.rows.map((r) => ({ ...r, balance: r.balance ?? '' })),
    };
    await api.post(`/api/closing/uploads/${res.body.upload.id}/discard`);
  }
  const score = scoreStatement(expected, actual);
  const pct = ((score.exact / score.total) * 100).toFixed(1);
  const md = [
    '# Evaluación del estado de cuenta en PDF (spec 022)',
    '',
    `- URL: ${url} · ${new Date().toISOString()} · HTTP ${res.status} en ${res.ms} ms`,
    `- Filas exactas: ${score.exact}/${score.total} (${pct} %) · filas de más: ${score.extra}`,
    `- Saldos inicial y final leídos bien: ${score.balancesOk ? 'sí' : 'no'}`,
    `- Cuadra \`balanceCheck\`: ${res.body?.balanceCheck?.ok ?? 'sin borrador'}`,
    `- Filas falladas (índice desde 0): ${score.misses.join(', ') || 'ninguna'}`,
    '',
  ].join('\n');
  console.log(
    `${score.exact}/${score.total} filas exactas (${pct} %) · saldos ${score.balancesOk ? 'ok' : 'mal'}`,
  );
  console.log(`Evidencia en ${await writeEvidence('eval-bank.md', md)}`);
}

main().catch((error: unknown) => fatal(error instanceof Error ? error.message : String(error)));

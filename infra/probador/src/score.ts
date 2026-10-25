/** Califica la evaluación de exactitud de la IA. Puro: no sabe de HTTP ni del reloj. */

export const EVAL_FIELDS = [
  'supplierName',
  'supplierTaxId',
  'invoiceNumber',
  'issueDate',
  'poNumber',
  'subtotal',
  'taxes',
  'total',
  'currency',
  'taxUuid',
] as const;
export type EvalField = (typeof EVAL_FIELDS)[number];
export type FieldValues = Record<EvalField, string | null>;

const MONEY: readonly EvalField[] = ['subtotal', 'taxes', 'total'];

export interface EvalResult {
  id: string;
  kind: string;
  expected: FieldValues;
  /** El documento no es de compras: debe quedar `out_of_scope`. */
  outOfScope: boolean;
  /** Lo que devolvió la API; `null` si la carga falló y no hubo expediente. */
  actual: { fields: FieldValues; status: string } | null;
}

export interface FieldScore {
  hits: number;
  expected: number;
  accuracy: number;
}

export interface EvalScore {
  fields: Record<EvalField, FieldScore>;
  overall: number;
  failures: { id: string; field: EvalField; expected: string; observed: string }[];
  invented: { id: string; field: EvalField; observed: string }[];
  outOfScope: { detected: number; total: number; missed: string[] };
  noResponse: string[];
  /** ≥ 95 % por campo, 0 inventados y 100 % de fuera de alcance detectados. */
  meetsGoal: boolean;
}

const text = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const cents = (value: string) => Math.round(Number(value) * 100);

export function matches(
  field: EvalField,
  expected: string | null,
  observed: string | null,
): boolean {
  if (expected === null || observed === null) return expected === observed;
  return MONEY.includes(field)
    ? cents(expected) === cents(observed)
    : text(expected) === text(observed);
}

export function scoreEval(results: EvalResult[]): EvalScore {
  const fields = Object.fromEntries(
    EVAL_FIELDS.map((f) => [f, { hits: 0, expected: 0, accuracy: 1 }]),
  ) as Record<EvalField, FieldScore>;
  const failures: EvalScore['failures'] = [];
  const invented: EvalScore['invented'] = [];
  const noResponse: string[] = [];

  for (const r of results) {
    if (!r.actual) noResponse.push(r.id);
    for (const field of EVAL_FIELDS) {
      const expected = r.expected[field];
      const observed = r.actual?.fields[field] ?? null;
      if (expected === null) {
        if (observed !== null) invented.push({ id: r.id, field, observed });
        continue;
      }
      fields[field].expected += 1;
      if (matches(field, expected, observed)) fields[field].hits += 1;
      else failures.push({ id: r.id, field, expected, observed: observed ?? '(vacío)' });
    }
  }
  for (const f of EVAL_FIELDS) {
    fields[f].accuracy = fields[f].expected === 0 ? 1 : fields[f].hits / fields[f].expected;
  }

  const scope = results.filter((r) => r.outOfScope);
  const missed = scope.filter((r) => r.actual?.status !== 'out_of_scope').map((r) => r.id);
  const totalExpected = EVAL_FIELDS.reduce((n, f) => n + fields[f].expected, 0);
  const totalHits = EVAL_FIELDS.reduce((n, f) => n + fields[f].hits, 0);

  return {
    fields,
    overall: totalExpected === 0 ? 1 : totalHits / totalExpected,
    failures,
    invented,
    outOfScope: { detected: scope.length - missed.length, total: scope.length, missed },
    noResponse,
    meetsGoal:
      EVAL_FIELDS.every((f) => fields[f].accuracy >= 0.95) &&
      invented.length === 0 &&
      missed.length === 0,
  };
}

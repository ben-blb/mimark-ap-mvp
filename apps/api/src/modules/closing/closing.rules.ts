/** Decisiones puras del cierre mensual (spec 020): sin I/O, sin reloj. */

/** Minúsculas, sin acentos y con espacios colapsados: la forma en que se comparan conceptos y patrones. */
export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchableRule {
  id: string;
  /** Patrón ya normalizado con `normalizeKey`. */
  patternKey: string;
  priority: number;
  active: boolean;
}

/**
 * La regla activa de mayor prioridad cuyo patrón aparece en el concepto; con igual prioridad,
 * la de patrón más largo (la más específica). Sin coincidencia: `null`.
 */
export function matchRule<R extends MatchableRule>(concept: string, rules: readonly R[]): R | null {
  const key = normalizeKey(concept);
  let best: R | null = null;
  for (const rule of rules) {
    if (!rule.active || !key.includes(rule.patternKey)) continue;
    if (
      !best ||
      rule.priority > best.priority ||
      (rule.priority === best.priority && rule.patternKey.length > best.patternKey.length)
    ) {
      best = rule;
    }
  }
  return best;
}

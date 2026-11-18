import { EDO_RES_LINES, type EdoResLine } from '@mimark/contracts/closing';

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

/** Categorías en el orden del Estado de resultados: por renglón (como en `EDO_RES_LINES`) y luego `sortOrder`. */
export function sortCategories<C extends { edoResLine: EdoResLine; sortOrder: number }>(
  categories: readonly C[],
): C[] {
  const position = (line: EdoResLine) => EDO_RES_LINES.indexOf(line);
  return [...categories].sort(
    (a, b) => position(a.edoResLine) - position(b.edoResLine) || a.sortOrder - b.sortOrder,
  );
}

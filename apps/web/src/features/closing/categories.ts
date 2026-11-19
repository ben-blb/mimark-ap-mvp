import type { CategoryDto } from '@mimark/contracts/closing';
import { EDO_RES_LINES } from '@mimark/contracts/closing';

/** Categorías activas en el orden del Estado de resultados (la UI solo ordena; las reglas viven en la API). */
export function sortCategories(categories: CategoryDto[]): CategoryDto[] {
  const position = (line: CategoryDto['edoResLine']) => EDO_RES_LINES.indexOf(line);
  return categories
    .filter((c) => c.active)
    .sort((a, b) => position(a.edoResLine) - position(b.edoResLine) || a.sortOrder - b.sortOrder);
}

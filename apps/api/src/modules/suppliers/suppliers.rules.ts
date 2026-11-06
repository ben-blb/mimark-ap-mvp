/** Reglas puras de proveedores. */

const LEGAL_SUFFIXES = [
  'S DE RL DE CV',
  'S DE RL',
  'SAPI DE CV',
  'SA DE CV',
  'SC DE RL',
  'SA',
  'SC',
];

/**
 * Nombre comparable (spec 015): mayúsculas, sin acentos, sin puntuación, sin espacios dobles y sin el sufijo de
 * sociedad. «PepsiCo de México, S. de R.L. de C.V.» → «PEPSICO DE MEXICO».
 */
export function normalizeName(name: string): string {
  let text = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/[^A-Z0-9&Ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const suffix of LEGAL_SUFFIXES) {
    if (text.endsWith(` ${suffix}`)) {
      text = text.slice(0, -suffix.length - 1).trim();
      break;
    }
  }
  return text;
}

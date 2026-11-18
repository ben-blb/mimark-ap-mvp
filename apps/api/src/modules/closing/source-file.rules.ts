/** Tipo de los archivos de fuente (spec 021): puras. */

export type SheetKind = 'xlsx' | 'csv';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04: un .xlsx es un ZIP

/**
 * El tipo real del archivo. Un `.xlsx` se reconoce por su firma (la extensión no cuenta); un CSV no tiene firma, así que
 * se exige texto (sin bytes de control ni NUL) y extensión `.csv`.
 */
export function detectSheetType(bytes: Uint8Array, fileName: string): SheetKind | null {
  if (ZIP_SIGNATURE.every((byte, i) => bytes[i] === byte)) return 'xlsx';
  if (!/\.csv$/i.test(fileName) || bytes.length === 0) return null;
  const head = bytes.subarray(0, 4096);
  const binary = head.some((b) => b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d));
  return binary ? null : 'csv';
}

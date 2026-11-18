import writeXlsxFile from 'write-excel-file/node';

/** Archivos de fuente sintéticos para las pruebas del cierre (spec 021). */
export type Cell = string | number | null;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function xlsx(rows: Cell[][]): Promise<Buffer> {
  return writeXlsxFile(
    rows.map((row) => row.map((cell) => (cell === null ? null : cell))),
  ).toBuffer();
}

export function csv(rows: Cell[][]): Buffer {
  const quote = (cell: Cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`;
  return Buffer.from(rows.map((row) => row.map(quote).join(',')).join('\n'), 'utf8');
}

/** Ventas de Parlevel de septiembre de 2026 para los kioskos dados. */
export const salesRows = (assets: string[]): Cell[][] => [
  ['Asset', 'Date', 'Sales', 'Commission'],
  ...assets.map((asset, i): Cell[] => [asset, `2026-09-0${i + 1}`, 100 * (i + 1), 10]),
];

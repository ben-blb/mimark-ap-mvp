import { Injectable } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';
import { AppError } from '../common/app-error.js';

/**
 * Lector de hojas de cálculo (spec 021): `.xlsx` y CSV a filas de valores (`string | number | boolean | Date | null`).
 * Solo lee la primera hoja y nunca evalúa fórmulas: devuelve el valor que el archivo trae.
 */
@Injectable()
export class SpreadsheetClient {
  async read(bytes: Buffer, kind: 'xlsx' | 'csv'): Promise<unknown[][]> {
    if (kind === 'csv') return parseCsv(decodeCsv(bytes));
    try {
      return await readSheet(bytes);
    } catch {
      throw new AppError(
        'FILE_TYPE_NOT_ALLOWED',
        'No pudimos leer el libro de Excel. Revisa que sea un .xlsx válido.',
      );
    }
  }
}

/** UTF-8 y, si no lo es, Latin-1: muchos bancos exportan así. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/** CSV (RFC 4180) a filas de texto. El separador es el más frecuente de la primera línea: `,`, `;` o tabulador. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

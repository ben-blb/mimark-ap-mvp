import { readSheet } from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';
import { SpreadsheetClient, decodeCsv, parseCsv } from './spreadsheet.client.js';

const client = new SpreadsheetClient();

describe('SpreadsheetClient', () => {
  it('AC-021-01 lee un .xlsx: cabecera y filas, con números y texto', async () => {
    const bytes = await writeXlsxFile([
      ['Asset', 'Date', 'Sales'],
      ['1C-FTLALNEPANTLA', '2026-09-03', 1500.5],
    ]).toBuffer();
    expect(await client.read(bytes, 'xlsx')).toEqual([
      ['Asset', 'Date', 'Sales'],
      ['1C-FTLALNEPANTLA', '2026-09-03', 1500.5],
    ]);
  });

  it('AC-021-14 una celda de texto =CMD() se lee como texto, no se evalúa', async () => {
    const bytes = await writeXlsxFile([['Concepto'], ['=CMD()']]).toBuffer();
    expect((await client.read(bytes, 'xlsx'))[1]).toEqual(['=CMD()']);
  });

  it('AC-021-01 lee un .csv', async () => {
    expect(await client.read(Buffer.from('a,b\n1,2\n'), 'csv')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('AC-021-02 un ZIP que no es un libro de Excel responde FILE_TYPE_NOT_ALLOWED', async () => {
    const error = await client
      .read(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]), 'xlsx')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });
});

describe('SpreadsheetClient.write', () => {
  it('AC-024-14 escribe varias hojas; los textos con = + - @ al inicio son texto y los números, números', async () => {
    const bytes = await client.write([
      {
        name: 'Uno',
        rows: [
          ['Concepto', 'Importe'],
          ['=CMD()', 12.5],
          ['@x', -3],
          ['-a', null],
        ],
      },
      { name: 'Dos', rows: [['+b']] },
    ]);
    expect(await client.read(bytes, 'xlsx')).toEqual([
      ['Concepto', 'Importe'],
      ['=CMD()', 12.5],
      ['@x', -3],
      ['-a', null],
    ]);
    expect(await readSheet(bytes, 'Dos')).toEqual([['+b']]);
  });
});

describe('parseCsv', () => {
  it('AC-021-01 separa filas y columnas, con comillas, comas y saltos dentro de un campo', () => {
    expect(
      parseCsv('Fecha,Concepto,Monto\r\n2026-09-01,"Pago, ADT ""SEC""",10\n2026-09-02,"a\nb",5\n'),
    ).toEqual([
      ['Fecha', 'Concepto', 'Monto'],
      ['2026-09-01', 'Pago, ADT "SEC"', '10'],
      ['2026-09-02', 'a\nb', '5'],
    ]);
  });

  it('AC-021-01 detecta punto y coma y tabulador como separador', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('AC-021-01 ignora el BOM y la última línea vacía', () => {
    expect(parseCsv('\uFEFFa,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('AC-021-14 una celda =CMD() queda como texto', () => {
    expect(parseCsv('a,b\n=CMD(),@SUM(1)')[1]).toEqual(['=CMD()', '@SUM(1)']);
  });
});

describe('decodeCsv', () => {
  it('AC-021-01 lee UTF-8 y, si no lo es, Latin-1 (bancos que exportan así)', () => {
    expect(decodeCsv(Buffer.from('Depósitos', 'utf8'))).toBe('Depósitos');
    expect(decodeCsv(Buffer.from('Dep\xf3sitos', 'latin1'))).toBe('Depósitos');
  });
});

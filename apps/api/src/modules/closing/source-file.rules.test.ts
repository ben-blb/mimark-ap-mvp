import { describe, expect, it } from 'vitest';
import { detectSheetType } from './source-file.rules.js';

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe('detectSheetType', () => {
  it('AC-021-02 un .xlsx se reconoce por su firma ZIP, aunque la extensión mienta', () => {
    expect(detectSheetType(zip, 'ventas.xlsx')).toBe('xlsx');
    expect(detectSheetType(zip, 'ventas.bin')).toBe('xlsx');
  });

  it('AC-021-02 un .csv es texto con extensión .csv', () => {
    expect(detectSheetType(Buffer.from('a,b\n1,2\n'), 'banco.CSV')).toBe('csv');
  });

  it('AC-021-02 un archivo que no es hoja de cálculo no se acepta', () => {
    expect(detectSheetType(Buffer.from('%PDF-1.7 hola'), 'factura.pdf')).toBeNull();
    expect(detectSheetType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]), 'x.csv')).toBeNull();
    expect(detectSheetType(Buffer.from('a,b\n'), 'notas.txt')).toBeNull();
    expect(detectSheetType(Buffer.alloc(0), 'vacio.csv')).toBeNull();
  });
});

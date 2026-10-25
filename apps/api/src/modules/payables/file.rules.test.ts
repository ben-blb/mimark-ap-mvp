import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import { checkQuota, checkReceivedOn, detectFileType } from './file.rules.js';

function errorOf(fn: () => void): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó error');
}

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('detectFileType', () => {
  it('AC-004-07 reconoce PDF, PNG y JPEG por su firma', () => {
    expect(detectFileType(new TextEncoder().encode('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
  });

  it('AC-004-07 rechaza cualquier otra cosa, aunque se llame .pdf', () => {
    expect(detectFileType(new TextEncoder().encode('MZ ejecutable'))).toBeNull();
    expect(detectFileType(new TextEncoder().encode('<html></html>'))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe('checkReceivedOn', () => {
  it('acepta hoy y fechas pasadas', () => {
    expect(() => checkReceivedOn('2026-10-20', '2026-10-20')).not.toThrow();
    expect(() => checkReceivedOn('2026-10-01', '2026-10-20')).not.toThrow();
  });

  it('rechaza una fecha futura indicando el campo', () => {
    const error = errorOf(() => checkReceivedOn('2026-10-21', '2026-10-20'));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toHaveProperty('invoiceReceivedOn');
  });
});

describe('checkQuota', () => {
  const limits = { actor: 30, total: 200 };

  it('AC-004-09 deja pasar mientras haya cupo', () => {
    expect(() => checkQuota({ actor: 29, total: 199 }, limits)).not.toThrow();
  });

  it('AC-004-09 bloquea al llegar al límite del actor', () => {
    expect(errorOf(() => checkQuota({ actor: 30, total: 31 }, limits)).code).toBe('QUOTA_EXCEEDED');
  });

  it('AC-004-09 bloquea al llegar al límite global', () => {
    expect(errorOf(() => checkQuota({ actor: 1, total: 200 }, limits)).code).toBe('QUOTA_EXCEEDED');
  });
});

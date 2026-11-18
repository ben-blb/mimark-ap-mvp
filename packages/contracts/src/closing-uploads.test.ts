import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.js';
import {
  CreateEntryInput,
  EntryListQuery,
  SOURCES,
  SignedMoney,
  UploadInput,
} from './closing-uploads.js';

describe('contratos de cargas del cierre (spec 021)', () => {
  it('AC-021-01 las fuentes son las seis de la tabla', () => {
    expect([...SOURCES]).toEqual([
      'parlevel_sales',
      'parlevel_waste',
      'cantaloupe',
      'bank_csv',
      'cash',
      'payroll',
    ]);
  });

  it('AC-021-01 la carga pide empresa, mes AAAA-MM y fuente; la cuenta es opcional', () => {
    const ok = { companyId: 'c1', month: '2026-09', source: 'bank_csv', accountId: 'a1' };
    expect(UploadInput.safeParse(ok).success).toBe(true);
    expect(UploadInput.safeParse({ ...ok, accountId: '' }).data?.accountId).toBeUndefined();
    for (const month of ['2026-9', '2026-13', 'septiembre', '2026-00', '']) {
      expect(UploadInput.safeParse({ ...ok, month }).success).toBe(false);
    }
    expect(UploadInput.safeParse({ ...ok, source: 'pdf' }).success).toBe(false);
  });

  it('AC-021-08 los importes llevan signo y hasta 2 decimales', () => {
    for (const ok of ['10', '-10', '-1234.5', '0.05', '-0.99']) {
      expect(SignedMoney.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['', '1,000.00', '$5', '1.234', '--1', '1e3']) {
      expect(SignedMoney.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('AC-021-12 la captura manual solo es de caja o nómina', () => {
    const base = { companyId: 'c1', date: '2026-09-15', concept: 'Gasolina', amount: '-350.00' };
    expect(CreateEntryInput.safeParse({ ...base, source: 'cash' }).success).toBe(true);
    expect(CreateEntryInput.safeParse({ ...base, source: 'payroll' }).success).toBe(true);
    expect(CreateEntryInput.safeParse({ ...base, source: 'bank_csv' }).success).toBe(false);
    expect(CreateEntryInput.safeParse({ ...base, source: 'cash', concept: ' ' }).success).toBe(
      false,
    );
    expect(
      CreateEntryInput.safeParse({ ...base, source: 'cash', date: '15/09/2026' }).success,
    ).toBe(false);
  });

  it('AC-021-13 el listado pide empresa y mes y pagina con valores por omisión', () => {
    const parsed = EntryListQuery.parse({ companyId: 'c1', month: '2026-09' });
    expect(parsed).toMatchObject({ page: 1, pageSize: 100 });
    expect(EntryListQuery.safeParse({ companyId: 'c1' }).success).toBe(false);
    expect(
      EntryListQuery.safeParse({ companyId: 'c1', month: '2026-09', pageSize: 5000 }).success,
    ).toBe(false);
  });

  it('AC-021-03 AC-021-04 AC-021-06 AC-021-11 los códigos de error existen en el catálogo', () => {
    for (const code of [
      'SOURCE_MISSING_COLUMNS',
      'SOURCE_WRONG_MONTH',
      'DUPLICATE_UPLOAD',
      'PERIOD_CLOSED',
    ]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

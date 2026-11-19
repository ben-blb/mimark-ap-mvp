import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.js';
import {
  BankDraftRow,
  BankExtraction,
  ConfirmUploadInput,
  CreateEntryInput,
  UpdateBankDraftInput,
  EntryListQuery,
  SOURCES,
  SignedMoney,
  UploadInput,
} from './closing-uploads.js';

describe('contratos de cargas del cierre (spec 021)', () => {
  it('AC-021-01 las fuentes son las de la tabla (más `bank_pdf`, spec 022)', () => {
    expect([...SOURCES]).toEqual([
      'parlevel_sales',
      'parlevel_waste',
      'cantaloupe',
      'bank_csv',
      'bank_pdf',
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

describe('contratos del estado de cuenta en PDF (spec 022)', () => {
  const row = {
    date: '2026-09-02',
    concept: 'SPEI',
    withdrawal: null,
    deposit: '100.00',
    balance: '10.00',
  };

  it('AC-022-02 la extracción trae saldos, fechas AAAA-MM-DD e importes con 2 decimales', () => {
    const ok = { openingBalance: '233214.38', closingBalance: '233264.38', rows: [row] };
    expect(BankExtraction.safeParse(ok).success).toBe(true);
    expect(
      BankExtraction.safeParse({ ...ok, rows: [{ ...row, date: '02/09/2026' }] }).success,
    ).toBe(false);
    expect(BankExtraction.safeParse({ ...ok, rows: [{ ...row, deposit: '1.234' }] }).success).toBe(
      false,
    );
    expect(BankExtraction.safeParse({ ...ok, openingBalance: null }).success).toBe(false);
  });

  it('AC-022-02 el borrador numera las filas desde 1', () => {
    expect(BankDraftRow.safeParse({ ...row, row: 1, discarded: false }).success).toBe(true);
    expect(BankDraftRow.safeParse({ ...row, row: 0, discarded: false }).success).toBe(false);
  });

  it('AC-022-06 la edición valida fecha, concepto e importes', () => {
    expect(
      UpdateBankDraftInput.safeParse({ rows: [{ row: 1, deposit: '5.00', withdrawal: null }] })
        .success,
    ).toBe(true);
    expect(UpdateBankDraftInput.safeParse({ rows: [] }).success).toBe(false);
    expect(UpdateBankDraftInput.safeParse({ rows: [{ row: 1, date: '2026-13-40' }] }).success).toBe(
      false,
    );
    expect(UpdateBankDraftInput.safeParse({ rows: [{ row: 1, withdrawal: '-3' }] }).success).toBe(
      false,
    );
    expect(UpdateBankDraftInput.safeParse({ rows: [{ row: 1, concept: '  ' }] }).success).toBe(
      false,
    );
  });

  it('AC-022-03 confirm acepta un cuerpo vacío o con acceptDifference', () => {
    expect(ConfirmUploadInput.parse({})).toEqual({});
    expect(ConfirmUploadInput.parse(undefined)).toEqual({});
    expect(ConfirmUploadInput.parse({ acceptDifference: true })).toEqual({
      acceptDifference: true,
    });
    expect(ConfirmUploadInput.safeParse({ acceptDifference: 'sí' }).success).toBe(false);
  });

  it('AC-021-01 la carga de hoja de cálculo ya no acepta `bank_pdf`', () => {
    const base = { companyId: 'c1', month: '2026-09' };
    expect(UploadInput.safeParse({ ...base, source: 'bank_pdf' }).success).toBe(false);
  });
});

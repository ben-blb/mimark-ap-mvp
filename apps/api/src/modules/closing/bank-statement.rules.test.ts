import type { BankDraftData, BankExtraction } from '@mimark/contracts/closing-uploads';
import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  balanceCheck,
  buildDraft,
  countRows,
  flagSequenceBreaks,
  maskAccountNumbers,
  openingMismatch,
  previousMonth,
  toEntries,
  withFlags,
} from './bank-statement.rules.js';

const row = (
  date: string,
  withdrawal: string | null,
  deposit: string | null,
  balance: string | null,
) => ({
  date,
  concept: 'SPEI',
  withdrawal,
  deposit,
  balance,
});
const draftOf = (opening: string, closing: string, rows: ReturnType<typeof row>[]): BankDraftData =>
  buildDraft({ openingBalance: opening, closingBalance: closing, rows } satisfies BankExtraction);

describe('balanceCheck', () => {
  const rows = [row('2026-09-01', null, '100.00', null), row('2026-09-02', '50.00', null, null)];

  it.each([
    ['233214.38', '233264.38', true, '0.00'],
    ['233214.38', '233264.39', false, '0.01'],
    ['233214.38', '233264.37', false, '-0.01'],
  ])(
    'AC-022-03 apertura %s, cierre %s → ok %s, diferencia %s',
    (opening, closing, ok, difference) => {
      expect(balanceCheck(draftOf(opening, closing, rows))).toEqual({ ok, difference });
    },
  );

  it('AC-022-03 una fila descartada no cuenta y saldos negativos funcionan', () => {
    const draft = draftOf('-10.00', '90.00', rows);
    const discarded = {
      ...draft,
      rows: draft.rows.map((r) => (r.row === 2 ? { ...r, discarded: true } : r)),
    };
    expect(balanceCheck(discarded)).toEqual({ ok: true, difference: '0.00' });
  });
});

describe('flagSequenceBreaks', () => {
  it('AC-022-04 marca solo la fila cuyo saldo no sigue al anterior', () => {
    const draft = draftOf('1000.00', '1100.00', [
      row('2026-09-01', null, '100.00', '1100.00'),
      row('2026-09-02', '30.00', null, '1060.00'), // debía ser 1070.00
      row('2026-09-03', '10.00', null, '1050.00'), // sigue a la fila impresa
      row('2026-09-04', null, '5.00', null), // sin saldo propio: no se verifica
    ]);
    expect([...flagSequenceBreaks(draft.rows, draft.openingBalance)]).toEqual([2]);
    expect(withFlags(draft, '2026-09').map((r) => r.flags)).toEqual([[], ['UNCERTAIN'], [], []]);
  });

  it('AC-022-04 la primera fila se compara contra el saldo inicial', () => {
    const draft = draftOf('1000.00', '1100.00', [row('2026-09-01', null, '100.00', '1200.00')]);
    expect([...flagSequenceBreaks(draft.rows, draft.openingBalance)]).toEqual([1]);
  });
});

describe('maskAccountNumbers', () => {
  it('AC-022-11 deja solo los últimos 4 dígitos de tarjetas, cuentas y CLABE', () => {
    expect(maskAccountNumbers('COMPRA 4152 3131 1234 5678 OXXO')).toBe('COMPRA ****5678 OXXO');
    expect(maskAccountNumbers('SPEI A 012345678901234567')).toBe('SPEI A ****4567');
    expect(maskAccountNumbers('CTA 1234-5678-90')).toBe('CTA ****7890');
  });

  it('AC-022-11 no toca folios cortos, fechas ni importes', () => {
    const text = 'REF 0012345 FECHA 2026-09-02 IMPORTE 1,234.50';
    expect(maskAccountNumbers(text)).toBe(text);
  });

  it('AC-022-11 el borrador y las ediciones se guardan ya enmascarados', () => {
    const draft = buildDraft({
      openingBalance: '0.00',
      closingBalance: '0.00',
      rows: [{ ...row('2026-09-01', null, null, null), concept: 'TARJETA 4152313112345678' }],
    });
    expect(draft.rows[0]!.concept).toBe('TARJETA ****5678');
    const { draft: edited } = applyEdits(draft, [{ row: 1, concept: 'CTA 012345678901234567' }]);
    expect(edited.rows[0]!.concept).toBe('CTA ****4567');
  });
});

describe('applyEdits y toEntries', () => {
  const base = draftOf('0.00', '0.00', [
    row('2026-09-01', null, '100.00', null),
    row('2026-10-01', '5.00', null, null),
  ]);

  it('AC-022-06 edita fecha, importes y descarta; rechaza retiro y depósito a la vez o filas que no existen', () => {
    const ok = applyEdits(base, [
      { row: 1, deposit: null, withdrawal: '7.00', date: '2026-09-05' },
      { row: 2, discarded: true },
    ]);
    expect(ok.fieldErrors).toEqual({});
    expect(ok.draft.rows[0]).toMatchObject({
      withdrawal: '7.00',
      deposit: null,
      date: '2026-09-05',
    });
    expect(ok.draft.rows[1]!.discarded).toBe(true);
    expect(base.rows[0]!.deposit).toBe('100.00'); // el original no se muta

    const bad = applyEdits(base, [
      { row: 1, withdrawal: '7.00' },
      { row: 9, concept: 'x' },
    ]);
    expect(Object.keys(bad.fieldErrors)).toEqual(['rows.0.deposit', 'rows.1.row']);
  });

  it('AC-022-05 las filas de otro mes se marcan y no se vuelven movimientos', () => {
    expect(withFlags(base, '2026-09').map((r) => r.flags)).toEqual([[], ['OUT_OF_MONTH']]);
    expect(countRows(base, '2026-09')).toEqual({ read: 2, rejected: 1 });
    expect(toEntries(base, '2026-09')).toEqual([
      {
        row: 1,
        date: '2026-09-01',
        concept: 'SPEI',
        amount: '100.00',
        needsReview: false,
        meta: { balance: null },
      },
    ]);
  });

  it('AC-022-07 depósito suma y retiro resta; una fila con secuencia rota pide revisión', () => {
    const draft = draftOf('0.00', '0.00', [
      row('2026-09-01', '25.50', null, '-25.50'),
      row('2026-09-02', null, '10.00', '99.00'),
    ]);
    expect(toEntries(draft, '2026-09').map((e) => [e.amount, e.needsReview])).toEqual([
      ['-25.50', false],
      ['10.00', true],
    ]);
  });
});

describe('openingMismatch', () => {
  it('AC-022-05 avisa solo si hay cierre previo y es distinto', () => {
    expect(openingMismatch('10.00', null)).toBe(false);
    expect(openingMismatch('10.00', '10.0')).toBe(false);
    expect(openingMismatch('10.00', '10.01')).toBe(true);
  });
});

describe('previousMonth', () => {
  it('AC-022-05 resta un mes y cruza el año', () => {
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

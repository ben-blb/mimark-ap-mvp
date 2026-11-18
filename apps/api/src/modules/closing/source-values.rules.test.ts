import { describe, expect, it } from 'vitest';
import { cellText, parseAmountCents, parseDate } from './source-values.rules.js';

describe('parseDate', () => {
  it.each([
    ['2026-09-15', '2026-09-15'],
    ['2026-09-15T00:00:00', '2026-09-15'],
    ['15/09/2026', '2026-09-15'],
    ['5/9/2026', '2026-09-05'],
    [new Date(Date.UTC(2026, 8, 15)), '2026-09-15'],
    [46280, '2026-09-15'], // serial de Excel
  ])('AC-021-04 %s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it.each([['31/02/2026'], ['2026-13-01'], ['mañana'], [''], [null], [undefined], [12]])(
    'AC-021-04 %s no es una fecha',
    (input) => {
      expect(parseDate(input)).toBeNull();
    },
  );
});

describe('parseAmountCents', () => {
  it.each([
    [1234.5, 123450],
    [-10, -1000],
    ['1,234.50', 123450],
    ['$ 1,234.50', 123450],
    ['-1234.5', -123450],
    ['(1,234.50)', -123450],
    ['0', 0],
  ])('AC-021-08 %s → %s centavos', (input, expected) => {
    expect(parseAmountCents(input)).toBe(expected);
  });

  it.each([[''], ['abc'], ['1.2.3'], [null], [undefined], [Number.NaN], ['=1+1']])(
    'AC-021-08 %s no es un importe',
    (input) => {
      expect(parseAmountCents(input)).toBeNull();
    },
  );
});

describe('cellText', () => {
  it('AC-021-14 una celda de texto con fórmula se queda como texto, sin interpretarse', () => {
    expect(cellText('=CMD()')).toBe('=CMD()');
    expect(cellText('  =HYPERLINK("x")  ')).toBe('=HYPERLINK("x")');
  });

  it('convierte números, fechas y vacíos a texto', () => {
    expect(cellText(15)).toBe('15');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(new Date(Date.UTC(2026, 8, 15)))).toBe('2026-09-15');
  });
});

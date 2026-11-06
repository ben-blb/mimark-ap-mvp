import { describe, expect, it } from 'vitest';
import { CreatePurchaseOrderInput, ReceiptInput, totalWithVat } from './purchase-orders.js';

const valid = {
  number: 'OC-1001',
  supplierId: 'sup_1',
  issuedOn: '2026-10-01',
  total: '11600.00',
  currency: 'MXN',
  lines: [{ description: 'Caja de vasos', quantity: '2', unit: 'caja', unitPrice: '100.5' }],
};

describe('CreatePurchaseOrderInput', () => {
  it('AC-003-02 normaliza el folio: sin espacios a los lados y en mayúsculas', () => {
    expect(CreatePurchaseOrderInput.parse({ ...valid, number: '  oc-1001 ' }).number).toBe(
      'OC-1001',
    );
  });

  it.each(['', 'OC 1001', '-OC1'])('AC-003-02 rechaza el folio inválido "%s"', (number) => {
    const result = CreatePurchaseOrderInput.safeParse({ ...valid, number });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['number']);
  });

  it.each(['0', '0.00', '-5', '10.123', 'abc'])('AC-003-03 rechaza el total %s', (total) => {
    const result = CreatePurchaseOrderInput.safeParse({ ...valid, total });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['total']);
  });

  it('AC-003-03 acepta un total positivo con hasta 2 decimales', () => {
    expect(CreatePurchaseOrderInput.safeParse({ ...valid, total: '0.01' }).success).toBe(true);
  });
});

describe('partidas', () => {
  const line = valid.lines[0]!;
  const withLines = (lines: unknown[]) => CreatePurchaseOrderInput.safeParse({ ...valid, lines });

  it('AC-014-01 exige al menos una partida y acepta hasta 200', () => {
    expect(withLines([]).error?.issues[0]?.path).toEqual(['lines']);
    expect(withLines(Array.from({ length: 200 }, () => line)).success).toBe(true);
    expect(withLines(Array.from({ length: 201 }, () => line)).success).toBe(false);
  });

  it.each([
    ['description', ''],
    ['quantity', '0'],
    ['quantity', '1.2345'],
    ['unit', ''],
    ['unitPrice', '-1'],
    ['unitPrice', '1.23456'],
  ])('AC-014-02 rechaza %s = "%s" y señala la partida', (field, value) => {
    const result = withLines([line, { ...line, [field]: value }]);
    expect(result.error?.issues[0]?.path).toEqual(['lines', 1, field]);
  });

  it('AC-014-02 acepta cantidad con 3 decimales, precio con 4 y SKU opcional', () => {
    expect(
      withLines([{ ...line, quantity: '0.125', unitPrice: '0.0001', sku: 'A-1' }]).success,
    ).toBe(true);
  });
});

describe('ReceiptInput', () => {
  it('AC-014-06 checkedLineIds es opcional y vale [] por defecto', () => {
    expect(ReceiptInput.parse({ receivedOn: '2026-10-05' }).checkedLineIds).toEqual([]);
  });
});

describe('totalWithVat (spec 015)', () => {
  it.each([
    ['30875.50', '35815.58'],
    ['100', '116.00'],
    ['0.03', '0.03'],
    ['0.05', '0.06'],
  ])('AC-015-07 %s + IVA 16 %% → %s', (subtotal, total) => {
    expect(totalWithVat(subtotal)).toBe(total);
  });
});

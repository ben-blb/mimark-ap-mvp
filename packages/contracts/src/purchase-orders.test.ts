import { describe, expect, it } from 'vitest';
import { CreatePurchaseOrderInput } from './purchase-orders.js';

const valid = {
  number: 'OC-1001',
  supplierId: 'sup_1',
  issuedOn: '2026-10-01',
  total: '11600.00',
  currency: 'MXN',
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

import { describe, expect, it } from 'vitest';
import { CreateSupplierInput } from './suppliers.js';

const valid = {
  name: 'Distribuidora Alimentos del Norte',
  taxId: 'DAN010203AB1',
  creditDays: 15,
  currency: 'MXN',
};

describe('CreateSupplierInput', () => {
  it('AC-002-02 normaliza el RFC a mayúsculas y sin espacios', () => {
    const parsed = CreateSupplierInput.parse({ ...valid, taxId: '  dan010203ab1 ' });
    expect(parsed.taxId).toBe('DAN010203AB1');
  });

  it.each(['DAN01020AB1', 'DAN010203AB12X', '1AN010203AB1', 'DAN-010203-AB1'])(
    'AC-002-02 rechaza el RFC con formato inválido: %s',
    (taxId) => {
      const result = CreateSupplierInput.safeParse({ ...valid, taxId });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['taxId']);
    },
  );

  it('AC-002-02 acepta RFC de persona física (13 caracteres)', () => {
    expect(CreateSupplierInput.safeParse({ ...valid, taxId: 'LOBB800101XY2' }).success).toBe(true);
  });

  it('AC-002-08 acepta días como texto del formulario y 0 como contado', () => {
    expect(CreateSupplierInput.parse({ ...valid, creditDays: '30' }).creditDays).toBe(30);
    expect(CreateSupplierInput.parse({ ...valid, creditDays: 0 }).creditDays).toBe(0);
  });

  it.each([
    ['', 'vacío'],
    [-1, 'negativo'],
    [366, 'mayor a 365'],
    [7.5, 'decimal'],
  ])('AC-002-08 rechaza días de crédito %s (%s)', (creditDays, _caso) => {
    const result = CreateSupplierInput.safeParse({ ...valid, creditDays });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['creditDays']);
  });
});

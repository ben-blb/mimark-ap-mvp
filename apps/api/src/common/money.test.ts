import { describe, expect, it } from 'vitest';
import { centsToMoney, moneyToCents, numberToCents } from './money.js';

describe('money', () => {
  it('convierte texto a centavos sin errores de redondeo', () => {
    expect(moneyToCents('11600')).toBe(1_160_000);
    expect(moneyToCents('11600.5')).toBe(1_160_050);
    expect(moneyToCents('0.07')).toBe(7);
  });

  it('rechaza importes con formato inválido', () => {
    expect(() => moneyToCents('11,600.00')).toThrow();
    expect(() => moneyToCents('1.234')).toThrow();
  });

  it('redondea importes numéricos al centavo', () => {
    expect(numberToCents(11600.004)).toBe(1_160_000);
    expect(numberToCents(0.1 + 0.2)).toBe(30);
  });

  it('vuelve a texto con 2 decimales', () => {
    expect(centsToMoney(1_160_050)).toBe('11600.50');
    expect(centsToMoney(7)).toBe('0.07');
  });
});

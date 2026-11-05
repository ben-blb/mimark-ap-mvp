import { describe, expect, it } from 'vitest';
import { normalizeName } from './suppliers.rules.js';

describe('normalizeName', () => {
  it.each([
    ['PepsiCo de México, S. de R.L. de C.V.', 'PEPSICO DE MEXICO'],
    ['Pepsico', 'PEPSICO'],
    ['  refrescos   del  norte ', 'REFRESCOS DEL NORTE'],
    ['Empaques y Desechables Regios SA de CV', 'EMPAQUES Y DESECHABLES REGIOS'],
    ['Café Sierra Madre SC', 'CAFE SIERRA MADRE'],
    ['SMART KIOSKO', 'SMART KIOSKO'],
  ])('AC-015-03 normaliza «%s» → «%s»', (name, expected) => {
    expect(normalizeName(name)).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';
import { fakeExtraction } from './fake-extraction.js';

describe('fakeExtraction · orden P3062 (verificación manual)', () => {
  const read = (name: string) => fakeExtraction(Buffer.from(`%PDF-1.7 ${name}`), name);

  it('«-recibido» factura el subtotal recibido (30,128.00) y sin sufijo todo lo pedido', () => {
    expect(read('factura-p3062-recibido.pdf')).toMatchObject({
      purchaseOrderNumber: 'P3062',
      subtotal: 30128,
      total: 34948.48,
    });
    expect(read('factura-p3062.pdf')).toMatchObject({ subtotal: 30875.5, total: 35815.58 });
  });
});

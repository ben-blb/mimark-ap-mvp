import { describe, expect, it } from 'vitest';
import { ReceiptLineDto, ReceiptOrderDto } from './receipts.js';

const FORBIDDEN = ['unitPrice', 'amount', 'total', 'taxes', 'currency', 'creditDays'];

function keysDeep(shape: unknown, out: string[] = []): string[] {
  const s = shape as { shape?: Record<string, unknown>; element?: unknown };
  if (s.shape) {
    for (const [k, v] of Object.entries(s.shape)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  if (s.element) keysDeep(s.element, out);
  return out;
}

describe('esquemas de recepciones', () => {
  it('AC-017-05 no declaran precios ni importes en ningún nivel', () => {
    const keys = [...keysDeep(ReceiptOrderDto), ...keysDeep(ReceiptLineDto)];
    expect(keys).toContain('description');
    for (const key of FORBIDDEN) expect(keys).not.toContain(key);
  });
});

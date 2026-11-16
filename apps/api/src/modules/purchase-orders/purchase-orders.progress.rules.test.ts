import type { PayableStatus } from '@mimark/contracts/payable-status';
import { describe, expect, it } from 'vitest';
import { poStage, receivedSubtotalCents } from './purchase-orders.progress.rules.js';

const open = { status: 'open', receiptStatus: 'received' } as const;

describe('poStage', () => {
  it.each([
    [{ status: 'cancelled', receiptStatus: 'pending' }, null, 'cancelled'],
    [{ status: 'cancelled', receiptStatus: 'received' }, 'paid', 'cancelled'],
    [{ status: 'open', receiptStatus: 'pending' }, null, 'to_receive'],
    [{ status: 'open', receiptStatus: 'received' }, null, 'to_invoice'],
    [{ status: 'open', receiptStatus: 'received_with_differences' }, null, 'to_invoice'],
    [open, 'uploaded', 'in_review'],
    [open, 'processing', 'in_review'],
    [open, 'failed', 'in_review'],
    [open, 'requires_review', 'in_review'],
    [open, 'out_of_scope', 'in_review'],
    [open, 'pending_confirmation', 'in_review'],
    [open, 'confirmed', 'to_schedule'],
    [open, 'scheduled', 'scheduled'],
    [open, 'paid', 'paid'],
  ] as const)('AC-019-01 %j con expediente %s → %s', (order, live, stage) => {
    expect(poStage(order, live as PayableStatus | null)).toBe(stage);
  });
});

describe('receivedSubtotalCents', () => {
  it('AC-019-04 suma cantidad recibida × precio, redondeando cada partida', () => {
    const lines = [
      { receivedQuantity: '70', unitPrice: '149.5' }, // 10465.00
      { receivedQuantity: '0.333', unitPrice: '10' }, // 3.33
    ];
    expect(receivedSubtotalCents(lines)).toBe(1046500 + 333);
  });

  it('AC-019-04 el caso de la OC P3062: recibir 70 de 75 baja el subtotal en 5 × 149.50', () => {
    const ordered = [
      { receivedQuantity: '75', unitPrice: '149.50' },
      { receivedQuantity: '100', unitPrice: '196.7550' },
    ];
    const received = [{ ...ordered[0]!, receivedQuantity: '70' }, ordered[1]!];
    expect(receivedSubtotalCents(ordered)! - receivedSubtotalCents(received)!).toBe(74750);
  });

  it('AC-019-04 es null sin partidas o mientras alguna no tenga lo recibido', () => {
    expect(receivedSubtotalCents([])).toBeNull();
    expect(receivedSubtotalCents([{ receivedQuantity: null, unitPrice: '10' }])).toBeNull();
  });

  it('AC-019-04 una partida en 0 aporta 0', () => {
    expect(
      receivedSubtotalCents([
        { receivedQuantity: '0', unitPrice: '10' },
        { receivedQuantity: '2', unitPrice: '10' },
      ]),
    ).toBe(2000);
  });
});

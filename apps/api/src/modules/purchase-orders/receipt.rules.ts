import type { LocalDate } from '@mimark/contracts/common';
import { AppError } from '../../common/app-error.js';
import { toScaled } from './purchase-orders.rules.js';

/** Reglas puras de la recepción de una OC (specs 003, 014 y 018). */

export function checkReceipt(
  po: {
    status: 'open' | 'cancelled';
    receiptStatus: 'pending' | 'received' | 'received_with_differences';
    issuedOn: LocalDate;
  },
  receivedOn: LocalDate,
  today: LocalDate,
): void {
  if (po.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', 'La OC está cancelada.');
  }
  if (po.receiptStatus !== 'pending') {
    throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
  }
  if (receivedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La fecha de recepción no puede ser futura' },
    });
  }
  if (receivedOn < po.issuedOn) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { receivedOn: 'La recepción no puede ser anterior a la OC' },
    });
  }
}

export type ReceiptDifference = {
  lineId: string;
  ordered: string;
  received: string;
};

/**
 * Valida lo recibido partida por partida (spec 018) y dice cómo queda la orden. Exige una cantidad por cada
 * partida de la OC, sin pasarse de lo pedido ni todo en 0; con diferencias exige `notes`.
 */
export function checkReceiptLines(
  orderLines: { id: string; quantity: string }[],
  input: { lines: { lineId: string; receivedQuantity: string }[]; notes?: string | undefined },
): { status: 'received' | 'received_with_differences'; differences: ReceiptDifference[] } {
  const failLines = (message: string) =>
    new AppError('VALIDATION', undefined, { fieldErrors: { lines: message } });
  const validQuantity = /^\d{1,9}(\.\d{1,3})?$/;
  if (input.lines.some((l) => !validQuantity.test(l.receivedQuantity))) {
    throw failLines('Cantidad inválida: usa números de 0 o más con hasta 3 decimales');
  }
  const ordered = new Map(orderLines.map((l) => [l.id, l.quantity]));
  const seen = new Set<string>();
  for (const { lineId } of input.lines) {
    if (!ordered.has(lineId)) throw failLines('Hay partidas que no son de esta OC');
    if (seen.has(lineId)) throw failLines('Hay partidas repetidas');
    seen.add(lineId);
  }
  if (seen.size < ordered.size) throw failLines('Captura todas las partidas');

  const differences: ReceiptDifference[] = [];
  let anyArrived = false;
  for (const { lineId, receivedQuantity } of input.lines) {
    const orderedQty = ordered.get(lineId)!;
    const received = toScaled(receivedQuantity, 3);
    const wanted = toScaled(orderedQty, 3);
    if (received > wanted) throw failLines('No puedes recibir más de lo pedido');
    if (received > 0n) anyArrived = true;
    if (received < wanted)
      differences.push({ lineId, ordered: orderedQty, received: receivedQuantity });
  }
  if (orderLines.length > 0 && !anyArrived) throw failLines('Si no llegó nada, no hay recepción');

  if (differences.length === 0) return { status: 'received', differences };
  if (!input.notes?.trim()) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { notes: 'Explica qué faltó' },
    });
  }
  return { status: 'received_with_differences', differences };
}

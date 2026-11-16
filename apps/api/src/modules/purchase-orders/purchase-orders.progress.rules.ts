import type { PayableStatus } from '@mimark/contracts/payable-status';
import type { PoStage } from '@mimark/contracts/purchase-orders';
import { moneyToCents } from '../../common/money.js';
import { lineAmount } from './purchase-orders.rules.js';

/** Reglas puras del avance de una orden (spec 019). */

/**
 * Etapa derivada de la orden. `live` es el estado del expediente vivo (no descartado) más antiguo ligado a la
 * orden, o null si no hay.
 */
export function poStage(
  order: {
    status: 'open' | 'cancelled';
    receiptStatus: 'pending' | 'received' | 'received_with_differences';
  },
  live: PayableStatus | null,
): PoStage {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.receiptStatus === 'pending') return 'to_receive';
  if (live === null || live === 'discarded') return 'to_invoice';
  if (live === 'confirmed') return 'to_schedule';
  if (live === 'scheduled') return 'scheduled';
  if (live === 'paid') return 'paid';
  return 'in_review';
}

/**
 * Suma de cantidad recibida × precio unitario, redondeada por partida igual que el importe pedido. Nulo si no
 * hay partidas o a alguna le falta lo recibido (recepción pendiente).
 */
export function receivedSubtotalCents(
  lines: { receivedQuantity: string | null; unitPrice: string }[],
): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    if (line.receivedQuantity === null) return null;
    total += moneyToCents(lineAmount(line.receivedQuantity, line.unitPrice));
  }
  return total;
}

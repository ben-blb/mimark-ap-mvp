import type { PAYABLE_ACTIONS, PayableStatus } from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';

/** Máquina de estados del expediente: qué se puede hacer en cada estado. Puro. */

export type PayableAction = (typeof PAYABLE_ACTIONS)[number];

/** Un `processing` sin cambios por más de esto se considera caído y se puede reintentar. */
export const RETRY_AFTER_MS = 5 * 60_000;

export const TRANSITIONS: Record<PayableStatus, readonly PayableStatus[]> = {
  uploaded: ['processing'],
  processing: ['pending_confirmation', 'requires_review', 'out_of_scope', 'failed'],
  failed: ['processing', 'discarded'],
  requires_review: ['requires_review', 'pending_confirmation', 'out_of_scope', 'discarded'],
  pending_confirmation: [
    'confirmed',
    'requires_review',
    'pending_confirmation',
    'out_of_scope',
    'discarded',
  ],
  out_of_scope: ['requires_review', 'pending_confirmation', 'out_of_scope', 'discarded'],
  confirmed: ['scheduled'],
  scheduled: ['scheduled', 'paid'],
  paid: [],
  discarded: [],
};

const ACTIONS: Record<PayableStatus, readonly PayableAction[]> = {
  uploaded: [],
  processing: [],
  failed: ['retry', 'discard'],
  requires_review: ['correct', 'discard'],
  pending_confirmation: ['correct', 'confirm', 'discard'],
  out_of_scope: ['correct', 'discard'],
  confirmed: ['schedule', 'documents'],
  scheduled: ['schedule', 'pay', 'documents'],
  paid: ['documents'],
  discarded: [],
};

export function assertTransition(from: PayableStatus, to: PayableStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError('INVALID_TRANSITION');
  }
}

/** `failed`, o `processing` sin cambios por más de 5 minutos (la función se cayó a la mitad). */
export function canRetry(status: PayableStatus, updatedAt: Date, now: Date): boolean {
  return (
    status === 'failed' ||
    (status === 'processing' && now.getTime() - updatedAt.getTime() > RETRY_AFTER_MS)
  );
}

export function allowedActions(status: PayableStatus, updatedAt: Date, now: Date): PayableAction[] {
  if (status === 'processing') return canRetry(status, updatedAt, now) ? ['retry'] : [];
  return [...ACTIONS[status]];
}

/** El complemento de pago solo aplica a proveedores a crédito: en uno de contado es `null` y no se marca. */
export function checkDocumentsInput(
  current: { complementStatus: 'pending' | 'received' | null },
  input: { invoiceDocStatus?: 'pending' | 'received'; complementStatus?: 'pending' | 'received' },
): void {
  if (input.complementStatus !== undefined && current.complementStatus === null) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: {
        complementStatus: 'Este proveedor es de contado: no lleva complemento de pago',
      },
    });
  }
}

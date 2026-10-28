import type { PayableStatus } from '@mimark/contracts/payables';
import { PAYABLE_STATUS_LABELS } from '../lib/labels';
import { type DotTone, StatusDot } from './StatusDot';

const TONES: Record<PayableStatus, DotTone> = {
  uploaded: 'neutral',
  processing: 'neutral',
  requires_review: 'warning',
  pending_confirmation: 'warning',
  confirmed: 'neutral',
  scheduled: 'primary',
  paid: 'success',
  out_of_scope: 'neutral',
  failed: 'error',
  discarded: 'neutral',
};

/** Estado de un expediente: punto y etiqueta. */
export function PayableStatusDot({ status }: { status: PayableStatus }) {
  return <StatusDot tone={TONES[status]}>{PAYABLE_STATUS_LABELS[status]}</StatusDot>;
}

import type { PayableStatus } from '@mimark/contracts/payables';
import Chip, { type ChipProps } from '@mui/material/Chip';
import { PAYABLE_STATUS_LABELS } from '../lib/labels';

const COLORS: Record<PayableStatus, ChipProps['color']> = {
  uploaded: 'default',
  processing: 'info',
  requires_review: 'warning',
  pending_confirmation: 'info',
  confirmed: 'primary',
  scheduled: 'success',
  paid: 'success',
  out_of_scope: 'default',
  failed: 'error',
  discarded: 'default',
};

export function StatusChip({ status }: { status: PayableStatus }) {
  return <Chip size="small" color={COLORS[status]} label={PAYABLE_STATUS_LABELS[status]} />;
}

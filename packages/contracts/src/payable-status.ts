import { z } from 'zod';

/** Estados de un expediente; viven aparte para que `purchase-orders` los use sin importar `payables`. */
export const PAYABLE_STATUSES = [
  'uploaded',
  'processing',
  'requires_review',
  'pending_confirmation',
  'confirmed',
  'scheduled',
  'paid',
  'out_of_scope',
  'failed',
  'discarded',
] as const;
export const PayableStatus = z.enum(PAYABLE_STATUSES);
export type PayableStatus = z.infer<typeof PayableStatus>;

import type { Permission } from '@mimark/contracts/permissions';
import type { PayableDto } from '@mimark/contracts/payables';

/**
 * Permiso que exige la API para cada acción de un expediente (spec 013). La UI solo lo usa para no ofrecer lo que
 * la API rechazaría con 403; la barrera real es la API.
 */
export const PAYABLE_ACTION_PERMISSION: Record<PayableDto['allowedActions'][number], Permission> = {
  retry: 'payables:write',
  correct: 'payables:write',
  documents: 'payables:write',
  discard: 'payables:write',
  confirm: 'payables:pay',
  schedule: 'payables:pay',
  pay: 'payables:pay',
};

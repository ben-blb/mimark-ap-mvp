import type { LocalDate } from '@mimark/contracts/common';
import { AppError } from '../../common/app-error.js';

/** Reglas puras de órdenes de compra. Las fechas son 'AAAA-MM-DD', así que se comparan como texto. */

export function checkIssuedOn(issuedOn: LocalDate, today: LocalDate): void {
  if (issuedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { issuedOn: 'La fecha de la OC no puede ser futura' },
    });
  }
}

export function checkReceipt(
  po: { status: 'open' | 'cancelled'; receiptStatus: 'pending' | 'received'; issuedOn: LocalDate },
  receivedOn: LocalDate,
  today: LocalDate,
): void {
  if (po.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', 'La OC está cancelada.');
  }
  if (po.receiptStatus === 'received') {
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

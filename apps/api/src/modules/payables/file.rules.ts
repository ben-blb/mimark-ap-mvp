import type { LocalDate } from '@mimark/contracts/common';
import type { ALLOWED_MIME_TYPES } from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';

/** Reglas puras de la carga de archivos. */

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const SIGNATURES: { mimeType: AllowedMimeType; bytes: number[] }[] = [
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/** El tipo real según los primeros bytes; la extensión y el tipo que declara el cliente no cuentan. */
export function detectFileType(bytes: Uint8Array): AllowedMimeType | null {
  const match = SIGNATURES.find(({ bytes: sig }) => sig.every((byte, i) => bytes[i] === byte));
  return match?.mimeType ?? null;
}

export function checkReceivedOn(receivedOn: LocalDate, today: LocalDate): void {
  if (receivedOn > today) {
    throw new AppError('VALIDATION', undefined, {
      fieldErrors: { invoiceReceivedOn: 'La fecha de recepción no puede ser futura' },
    });
  }
}

export function checkQuota(
  used: { actor: number; total: number },
  limits: { actor: number; total: number },
): void {
  if (used.actor >= limits.actor || used.total >= limits.total) {
    throw new AppError('QUOTA_EXCEEDED');
  }
}

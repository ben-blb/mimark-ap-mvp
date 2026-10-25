import { z } from 'zod';

/**
 * Catálogo de errores que la API puede devolver. Cada spec agrega aquí sus códigos;
 * el estado HTTP de cada uno vive en apps/api/src/common/app-error.ts.
 */
export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'ACCESS_DENIED',
  'RATE_LIMITED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'FILE_TOO_LARGE',
  'FILE_TYPE_NOT_ALLOWED',
  'QUOTA_EXCEEDED',
  'AI_UNAVAILABLE',
  'STALE_STATUS',
  'REVIEW_REQUIRED',
  'DUPLICATE_INVOICE',
  'INTERNAL',
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Formato único de error. Nunca incluye stack traces ni datos internos. */
export const ErrorResponse = z.object({
  code: ErrorCode,
  message: z.string(),
  requestId: z.string(),
  /** Errores por campo para formularios: { taxId: 'Ya existe un proveedor con ese RFC' }. */
  fieldErrors: z.record(z.string(), z.string()).optional(),
  /** Datos extra que la UI necesita para reaccionar, p. ej. { payableId }. */
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

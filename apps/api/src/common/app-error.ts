import type { ErrorCode } from '@mimark/contracts/errors';

/** Estado HTTP de cada código. Al agregar un código en contracts, TypeScript exige ponerlo aquí. */
const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  ACCESS_DENIED: 401,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  FILE_TOO_LARGE: 413,
  FILE_TYPE_NOT_ALLOWED: 415,
  QUOTA_EXCEEDED: 429,
  AI_UNAVAILABLE: 502,
  STALE_STATUS: 409,
  INTERNAL: 500,
};

/** Mensaje por defecto, en el idioma del usuario. Nunca incluye detalles internos. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION: 'Revisa los datos marcados.',
  UNAUTHENTICATED: 'Tu sesión terminó. Vuelve a entrar.',
  ACCESS_DENIED: 'El código de acceso no es correcto.',
  RATE_LIMITED: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  CONFLICT: 'Ya existe un registro con esos datos.',
  INVALID_TRANSITION: 'Esta acción no está permitida en el estado actual.',
  FILE_TOO_LARGE: 'El archivo pesa más de 4 MB. Comprímelo o súbelo en otra resolución.',
  FILE_TYPE_NOT_ALLOWED: 'Solo se aceptan archivos PDF, PNG o JPG.',
  QUOTA_EXCEEDED: 'Se alcanzó el límite diario de documentos procesados. Intenta mañana.',
  AI_UNAVAILABLE:
    'No pudimos leer el documento en este momento. Intenta de nuevo con «Reintentar».',
  STALE_STATUS: 'Alguien más actualizó este expediente. Recarga para ver su estado actual.',
  INTERNAL: 'Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte la referencia.',
};

export interface AppErrorExtra {
  fieldErrors?: Record<string, string>;
  details?: Record<string, unknown>;
}

/**
 * Error de negocio con un código del catálogo. Es una clase simple (sin Nest) para que
 * las reglas puras puedan lanzarlo; error.filter.ts lo convierte en la respuesta HTTP.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly extra: AppErrorExtra = {},
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'AppError';
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

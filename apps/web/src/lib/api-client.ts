import { type ErrorCode, ErrorResponse } from '@mimark/contracts/errors';
import type { z } from 'zod';

/** Error de la API con su código, mensaje para el usuario y referencia (requestId). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly requestId?: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Única puerta de la UI hacia el servidor. Llama a /api en el mismo origen (sin CORS) y valida
 * cada respuesta con su esquema de contracts: si el contrato se rompe, falla aquí y no tres
 * componentes después.
 */
async function call<S extends z.ZodType>(
  method: string,
  path: string,
  schema: S | null,
  body?: unknown,
): Promise<z.infer<S>> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(
      0,
      'INTERNAL',
      'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.',
    );
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || schema === null) return undefined as z.infer<S>;

  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      'INTERNAL',
      'La respuesta del servidor no tiene el formato esperado.',
      res.headers.get('x-request-id') ?? undefined,
    );
  }
  return parsed.data;
}

async function toApiError(res: Response): Promise<ApiError> {
  const parsed = ErrorResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    const ref = res.headers.get('x-request-id') ?? undefined;
    return new ApiError(res.status, 'INTERNAL', 'Ocurrió un error inesperado.', ref);
  }
  const { code, message, requestId, fieldErrors, details } = parsed.data;
  return new ApiError(res.status, code, message, requestId, fieldErrors, details);
}

/** Arma "?a=1&b=2" sin los valores vacíos. */
export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  get: <S extends z.ZodType>(path: string, schema: S) => call('GET', path, schema),
  post: <S extends z.ZodType>(path: string, body: unknown, schema: S) =>
    call('POST', path, schema, body),
  patch: <S extends z.ZodType>(path: string, body: unknown, schema: S) =>
    call('PATCH', path, schema, body),
  delete: (path: string) => call('DELETE', path, null),
};

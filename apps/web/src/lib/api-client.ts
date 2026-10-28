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

/**
 * POST que responde Server-Sent Events (spec 010): valida cada evento `data:` con `schema` y lo entrega a
 * `onEvent` en orden. Un error antes del stream llega como `ApiError`, igual que en `call`. `signal` lo corta.
 */
async function stream<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  onEvent: (event: z.infer<S>) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      0,
      'INTERNAL',
      'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.',
    );
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(res.status, 'INTERNAL', 'Ocurrió un error inesperado.');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      const parsed = schema.safeParse(JSON.parse(data));
      if (!parsed.success) {
        throw new ApiError(
          res.status,
          'INTERNAL',
          'La respuesta del servidor no tiene el formato esperado.',
        );
      }
      onEvent(parsed.data);
    }
  }
}

export const api = {
  stream,
  get: <S extends z.ZodType>(path: string, schema: S) => call('GET', path, schema),
  post: <S extends z.ZodType>(path: string, body: unknown, schema: S) =>
    call('POST', path, schema, body),
  /** POST multipart (archivo + campos). El navegador pone el content-type con su boundary. */
  upload: <S extends z.ZodType>(path: string, form: FormData, schema: S) =>
    call('POST', path, schema, form),
  put: <S extends z.ZodType>(path: string, body: unknown, schema: S) =>
    call('PUT', path, schema, body),
  patch: <S extends z.ZodType>(path: string, body: unknown, schema: S) =>
    call('PATCH', path, schema, body),
  delete: (path: string) => call('DELETE', path, null),
};

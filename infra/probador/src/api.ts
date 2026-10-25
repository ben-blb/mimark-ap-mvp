/** Cliente HTTP mínimo. El probador es caja negra: todo pasa por la API pública, con una sesión como persona. */

export interface Resp<T = unknown> {
  status: number;
  body: T;
  ms: number;
  /** Referencia para los logs: `x-vercel-id` si el despliegue lo trae, si no el requestId del error. */
  ref: string;
  contentType: string;
}

/** Lo que el probador lee de un expediente. */
export interface PayableView {
  id: string;
  status: string;
  allowedActions: string[];
  reviewReasons: { code: string; field?: string }[];
  fields: Record<string, string | null>;
  supplier: { name: string; creditDays: number } | null;
  purchaseOrder: { number: string } | null;
  schedule: { dueOn: string; suggestedPayOn: string } | null;
  extraction: { model: string; promptVersion: string } | null;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: { payableId?: string };
}

export class Api {
  private cookie = '';
  readonly base: string;

  constructor(url: string) {
    this.base = url.replace(/\/+$/, '');
  }

  /** Inicia sesión con el código de acceso. El código nunca se imprime ni se guarda. */
  async login(code: string, name = 'probador'): Promise<void> {
    const res = await this.request('POST', '/api/session', {
      json: { code, name, role: 'payables' },
    });
    if (res.status !== 200)
      throw new Error(
        `No se pudo iniciar sesión (HTTP ${res.status}). Revisa PROBADOR_CODE y la URL.`,
      );
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { json?: unknown; form?: FormData } = {},
  ): Promise<Resp<T>> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    let body: string | FormData | undefined;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['content-type'] = 'application/json';
    } else if (opts.form) {
      body = opts.form;
    }

    const started = Date.now();
    const res = await fetch(`${this.base}${path}`, { method, headers, body, redirect: 'manual' });
    const text = await res.text();
    const ms = Date.now() - started;

    const setCookies = res.headers.getSetCookie();
    if (setCookies.length > 0) this.cookie = setCookies.map((c) => c.split(';')[0]).join('; ');

    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // No era JSON (p. ej. el archivo original): se deja el texto.
    }
    const requestId = (parsed as Partial<ApiError> | null)?.requestId;
    return {
      status: res.status,
      body: parsed as T,
      ms,
      ref: res.headers.get('x-vercel-id') ?? requestId ?? 'local',
      contentType: res.headers.get('content-type') ?? '',
    };
  }

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T = unknown>(path: string, json?: unknown) {
    return this.request<T>('POST', path, { json: json ?? {} });
  }

  patch<T = unknown>(path: string, json: unknown) {
    return this.request<T>('PATCH', path, { json });
  }

  upload(bytes: Uint8Array, fileName: string, fields: Record<string, string> = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), fileName);
    return this.request<PayableView & ApiError>('POST', '/api/payables', { form });
  }
}

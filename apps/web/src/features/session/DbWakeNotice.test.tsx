import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthLayout } from './AuthLayout';
import { DbWakeNotice } from './DbWakeNotice';

const healthy = { status: 'ok', db: 'ok', version: 'abc1234', environment: 'test' };
const asleep = { ...healthy, status: 'degraded', db: 'error' };

type Reply = { body: unknown; status?: number; delayMs?: number } | 'network-error';

/** Cada llamada a /api/health toma la siguiente respuesta de la lista (la última se repite). */
function mockHealth(replies: Reply[]) {
  let calls = 0;
  const fetchMock = vi.fn(() => {
    const reply = replies[Math.min(calls++, replies.length - 1)]!;
    if (reply === 'network-error') return Promise.reject(new TypeError('fetch failed'));
    const response = new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
    return new Promise<Response>((resolve) =>
      setTimeout(() => resolve(response), reply.delayMs ?? 0),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderNotice() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DbWakeNotice />
    </QueryClientProvider>,
  );
}

/** Avanza el reloj simulado y deja resolver las promesas pendientes. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const notice = () => screen.queryByRole('status');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DbWakeNotice', () => {
  it('AC-016-01 al abrirse consulta /api/health una vez', async () => {
    const fetchMock = mockHealth([{ body: healthy }]);
    renderNotice();
    await advance(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('AC-016-02 si la base responde bien en menos de 2 segundos no muestra aviso', async () => {
    mockHealth([{ body: healthy, delayMs: 500 }]);
    renderNotice();

    await advance(400);
    expect(notice()).toBeNull();
    await advance(5_000);
    expect(notice()).toBeNull();
  });

  it('AC-016-03 si /api/health tarda más de 2 segundos muestra el aviso', async () => {
    mockHealth([{ body: healthy, delayMs: 6_000 }]);
    renderNotice();

    await advance(1_900);
    expect(notice()).toBeNull();
    await advance(200);
    expect(notice()).toHaveTextContent('Despertando la base de datos');
    expect(notice()).toHaveTextContent('Puede tardar unos segundos');
  });

  it('AC-016-04 con db "error" muestra el aviso y vuelve a consultar cada 3 segundos', async () => {
    const fetchMock = mockHealth([{ body: asleep }]);
    renderNotice();

    await advance(100);
    expect(notice()).toHaveTextContent('Despertando la base de datos');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('AC-016-05 si la consulta falla por red o con error HTTP muestra el aviso y reintenta', async () => {
    const fetchMock = mockHealth(['network-error', { body: { code: 'INTERNAL' }, status: 500 }, { body: healthy }]);
    renderNotice();

    await advance(100);
    expect(notice()).toHaveTextContent('Despertando la base de datos');
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notice()).toHaveTextContent('Despertando la base de datos');
  });

  it('AC-016-06 cuando la base responde db "ok" el aviso desaparece y deja de consultar', async () => {
    const fetchMock = mockHealth([{ body: asleep }, { body: healthy }]);
    renderNotice();

    await advance(100);
    expect(notice()).not.toBeNull();
    await advance(3_000);
    expect(notice()).toBeNull();
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AC-016-07 con el aviso visible el formulario de entrada sigue usable', async () => {
    mockHealth([{ body: asleep }]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthLayout onSubmit={(event) => event.preventDefault()}>
          <button type="submit">Entrar</button>
        </AuthLayout>
      </QueryClientProvider>,
    );

    await advance(100);
    expect(notice()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('AC-016-08 una respuesta que no cumple el contrato se trata como falla, sin error en pantalla', async () => {
    const fetchMock = mockHealth([{ body: { needsSetup: false } }, { body: healthy }]);
    renderNotice();

    await advance(100);
    expect(notice()).toHaveTextContent('Despertando la base de datos');
    expect(screen.queryByRole('alert')).toBeNull();
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notice()).toBeNull();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { Role } from '@mimark/contracts/session';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionKey } from '../features/session/session.api';
import { markTourSeen } from '../features/tour/tour.storage';
import { setViewport } from '../test/setup';
import { routes } from './router';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function open(role: Role, path: string) {
  // La persona ya vio el tutorial: no debe abrirse encima de la pantalla.
  markTourSeen('Ana López');
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  setViewport(1440);
  const client = new QueryClient();
  client.setQueryData(sessionKey, {
    userId: 'u1',
    actor: 'Ana López',
    role,
    mustChangePassword: false,
    expiresAt: '2026-10-28T00:00:00.000Z',
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, fetchMock };
}

const NO_ACCESS = 'Tu rol no tiene acceso a esta página.';

describe('rutas por permiso', () => {
  it.each([
    ['warehouse', '/proveedores'],
    ['warehouse', '/ordenes'],
    ['warehouse', '/expedientes'],
    ['warehouse', '/tablero'],
    ['warehouse', '/asistente'],
    ['warehouse', '/usuarios'],
    ['purchasing', '/expedientes'],
    ['purchasing', '/tablero'],
    ['purchasing', '/recepciones'],
    ['purchasing', '/usuarios'],
    ['manager', '/recepciones'],
    ['payables', '/usuarios'],
  ] as const)('AC-017-08 %s en %s ve «sin acceso» y no llama a la API', async (role, path) => {
    const { fetchMock } = open(role, path);
    expect(await screen.findByText(NO_ACCESS)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['payables', '/', 'Mi trabajo'],
    ['purchasing', '/', 'Mi trabajo'],
    ['admin', '/', 'Mi trabajo'],
  ] as const)('AC-017-09 %s abre «Mi trabajo» en %s', async (role, path, title) => {
    const { router } = open(role, path);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('AC-017-09 sin bandeja, almacén va a /recepciones', async () => {
    const { router } = open('warehouse', '/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/recepciones'));
    expect(await screen.findByRole('heading', { name: 'Recepciones' })).toBeInTheDocument();
  });

  it('AC-017-09 sin bandeja ni recepciones, gerencia va a /tablero', async () => {
    const { router } = open('manager', '/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/tablero'));
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupPage } from './SetupPage';

const session = {
  userId: 'u1',
  actor: 'Ada',
  role: 'admin',
  mustChangePassword: false,
  expiresAt: '2026-11-03T00:00:00.000Z',
};

/** Responde /api/setup como el servidor: antes de crear falta configurar; después ya no. */
function mockApi() {
  let created = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const post = init?.method === 'POST';
      if (post) created = true;
      const body = post ? session : { needsSetup: !created };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('SetupPage', () => {
  it('AC-013-24 al crear al administrador entra a la aplicación, no a /login', async () => {
    mockApi();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/configuracion-inicial']}>
          <Routes>
            <Route path="/configuracion-inicial" element={<SetupPage />} />
            <Route path="/login" element={<p>pantalla de login</p>} />
            <Route path="/" element={<p>inicio</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Código de configuración'), 'mimark-local');
    await user.type(screen.getByLabelText('Tu nombre'), 'Ada Admin');
    await user.type(screen.getByLabelText('Correo'), 'ada@mimark.mx');
    await user.type(screen.getByLabelText('Contraseña'), 'contrasena-larga-1');
    await user.click(screen.getByRole('button', { name: 'Crear administrador' }));

    expect(await screen.findByText('inicio')).toBeInTheDocument();
    expect(screen.queryByText('pantalla de login')).not.toBeInTheDocument();
  });

  it('AC-013-24 si ya hay usuarios, la configuración inicial manda a /login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ needsSetup: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/configuracion-inicial']}>
          <Routes>
            <Route path="/configuracion-inicial" element={<SetupPage />} />
            <Route path="/login" element={<p>pantalla de login</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  });
});

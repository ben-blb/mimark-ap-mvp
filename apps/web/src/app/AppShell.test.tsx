import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { sessionKey } from '../features/session/session.api';
import { setViewport } from '../test/setup';
import { AppShell } from './AppShell';

function setup(width: number) {
  setViewport(width);
  const client = new QueryClient();
  client.setQueryData(sessionKey, {
    actor: 'Ana López',
    role: 'payables',
    expiresAt: '2026-10-28T00:00:00.000Z',
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/expedientes']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<p>contenido</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const SECTIONS = ['Tablero', 'Proveedores', 'Órdenes de compra', 'Expedientes', 'Asistente'];

describe('AppShell', () => {
  it('AC-009-02 en escritorio, barra lateral con las 5 secciones, la activa marcada y «Salir»', () => {
    setup(1440);
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(SECTIONS);
    expect(within(nav).getByRole('link', { name: 'Expedientes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Tablero' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('Cuentas por pagar', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });

  it('AC-009-02 en el teléfono, barra inferior con las 5 secciones y la cuenta en un menú', async () => {
    const user = setup(375);
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label')),
    ).toEqual(SECTIONS);
    expect(within(nav).getByRole('link', { name: 'Expedientes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(screen.getByRole('button', { name: 'Cuenta' }));
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Salir' })).toBeInTheDocument();
  });
});

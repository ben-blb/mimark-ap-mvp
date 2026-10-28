import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionKey } from '../features/session/session.api';
import { hasSeenTour, markTourSeen } from '../features/tour/tour.storage';
import { setViewport } from '../test/setup';
import { AppShell } from './AppShell';

afterEach(() => localStorage.clear());

/** Por defecto la persona ya vio el tutorial, para que no se abra solo en las demás pruebas. */
function setup(width: number, tourSeen = true) {
  if (tourSeen) markTourSeen('Ana López');
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
            <Route path="/asistente" element={<p>asistente</p>} />
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
    expect(screen.getAllByText('Cuentas por pagar', { selector: 'div' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });

  it('AC-010-02 la marca es texto, sin logotipo, y abajo están el nombre y el rol', () => {
    setup(1440);
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('MIMARK')).toBeInTheDocument();
    expect(within(aside).queryByRole('img')).not.toBeInTheDocument();
    expect(within(aside).getByText('Ana López')).toBeInTheDocument();
    expect(within(aside).getAllByText('Cuentas por pagar')).toHaveLength(2);
  });

  it('AC-010-08 ⌘K y Ctrl+K llevan al asistente desde cualquier pantalla', async () => {
    const user = setup(1440);
    expect(screen.getByText('contenido')).toBeInTheDocument();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByText('asistente')).toBeInTheDocument();
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
    expect(screen.getByRole('menu')).toHaveTextContent('Ana López');
    expect(screen.getByRole('menuitem', { name: 'Salir' })).toBeInTheDocument();
  });

  it('AC-012-01 la primera vez el tutorial se abre solo y al saltarlo no vuelve a abrirse', async () => {
    const user = setup(1440, false);
    expect(screen.getByRole('dialog', { name: 'Bienvenida a MIMARK' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasSeenTour('Ana López')).toBe(true);
  });

  it('AC-012-02 con la marca guardada, el tutorial no se abre solo', () => {
    setup(1440);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-012-04 «Ver tutorial» de la barra lateral lo abre aunque ya lo haya visto', async () => {
    const user = setup(1440);
    await user.click(screen.getByRole('button', { name: 'Ver tutorial' }));
    expect(screen.getByRole('dialog', { name: 'Bienvenida a MIMARK' })).toBeInTheDocument();
  });

  it('AC-012-04 en el teléfono «Ver tutorial» está en el menú de cuenta', async () => {
    const user = setup(375);
    await user.click(screen.getByRole('button', { name: 'Cuenta' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ver tutorial' }));
    expect(screen.getByRole('dialog', { name: 'Bienvenida a MIMARK' })).toBeInTheDocument();
  });

  it('AC-012-06 los pasos resaltan la navegación real de la barra lateral', async () => {
    const user = setup(1440);
    await user.click(screen.getByRole('button', { name: 'Ver tutorial' }));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(document.querySelector('[data-tour-highlight="tablero"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="tablero"]')).toHaveTextContent('Tablero');
  });
});

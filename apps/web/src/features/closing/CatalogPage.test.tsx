import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { sessionKey } from '../session/session.api';
import { CatalogPage } from './CatalogPage';

const stamp = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const company = { id: 'co1', name: 'Quima Tlalnepantla', active: true, ...stamp };
const kiosk = {
  id: 'k1',
  companyId: 'co1',
  name: 'Kiosko Plaza Satélite',
  parlevelAsset: 'A-100',
  cantaloupeDeviceId: 'D-200',
  active: true,
  ...stamp,
};
const category = {
  id: 'cat1',
  code: 'SEGURIDAD',
  name: 'Seguridad y vigilancia',
  edoResLine: 'Seguridad y vigilancia',
  kind: 'expense',
  sortOrder: 10,
  active: true,
  ...stamp,
};
const rule = {
  id: 'r1',
  pattern: 'ADT SECURITY',
  categoryId: 'cat1',
  priority: 0,
  active: true,
  ...stamp,
};

function stubApi() {
  const lists: Record<string, unknown[]> = {
    '/api/closing/companies': [company],
    '/api/closing/kiosks': [kiosk],
    '/api/closing/accounts': [],
    '/api/closing/categories': [category],
    '/api/closing/rules': [rule],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify({ items: lists[url.split('?')[0] ?? ''] ?? [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
}

function setup(role: 'admin' | 'manager') {
  stubApi();
  setViewport(1440);
  const client = new QueryClient();
  client.setQueryData(sessionKey, {
    userId: 'u1',
    actor: 'Ana',
    role,
    mustChangePassword: false,
    expiresAt: '2026-12-28T00:00:00.000Z',
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => vi.unstubAllGlobals());

describe('CatalogPage (spec 020)', () => {
  it('AC-020-12 con reports:write ofrece «Agregar» y editar en cada pestaña', async () => {
    const user = setup('admin');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Empresas',
      'Kioskos',
      'Cuentas',
      'Categorías',
      'Reglas',
    ]);
    expect(await screen.findByText('Quima Tlalnepantla')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar empresa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Kioskos' }));
    expect(await screen.findByText('Kiosko Plaza Satélite')).toBeInTheDocument();
    expect(screen.getByText('A-100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar kiosko' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reglas' }));
    expect(await screen.findByText('ADT SECURITY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar regla' })).toBeInTheDocument();
  });

  it('AC-020-12 sin reports:write solo lista: sin «Agregar» ni «Editar», en ninguna pestaña', async () => {
    const user = setup('manager');
    expect(await screen.findByText('Quima Tlalnepantla')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();

    for (const tab of ['Kioskos', 'Categorías', 'Reglas']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    }
    // Probar un concepto es de lectura: sigue disponible.
    expect(screen.getByRole('button', { name: 'Probar' })).toBeInTheDocument();
  });
});

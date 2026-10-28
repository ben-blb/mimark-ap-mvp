import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayablesPage } from './PayablesPage';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function setup(entry: string) {
  const fetchMock = vi.fn((_url: string) => Promise.resolve(json({ items: [] })));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <PayablesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  /** Los parámetros de la última petición a /api/payables. */
  const lastQuery = () => {
    const urls = fetchMock.mock.calls
      .map(([url]) => url)
      .filter((u) => u.startsWith('/api/payables'));
    return new URLSearchParams(urls.at(-1)?.split('?')[1] ?? '');
  };
  return { fetchMock, lastQuery, user: userEvent.setup() };
}

afterEach(() => vi.unstubAllGlobals());

describe('PayablesPage: filtros en la URL', () => {
  it('AC-006-04 un enlace con filtros (como el del tablero) los aplica a la consulta y a los filtros', async () => {
    const { lastQuery } = setup('/expedientes?status=requires_review,pending_confirmation');
    await waitFor(() =>
      expect(lastQuery().get('status')).toBe('requires_review,pending_confirmation'),
    );
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue(
      'requires_review,pending_confirmation',
    );
  });

  it('AC-006-04 los filtros se combinan: estado y vencimiento de la URL viajan juntos', async () => {
    const { lastQuery } = setup('/expedientes?status=confirmed,scheduled&due=15');
    await waitFor(() => expect(lastQuery().get('due')).toBe('15'));
    expect(lastQuery().get('status')).toBe('confirmed,scheduled');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('confirmed,scheduled');
    expect(screen.getByRole('combobox', { name: 'Vencimiento' })).toHaveValue('15');
  });

  it('AC-006-04 cambiar un filtro conserva los demás y vuelve a consultar', async () => {
    const { lastQuery, user } = setup('/expedientes?status=confirmed,scheduled&due=15');
    await waitFor(() => expect(lastQuery().get('due')).toBe('15'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Vencimiento' }), 'Vencidos');
    await waitFor(() => expect(lastQuery().get('due')).toBe('overdue'));
    expect(lastQuery().get('status')).toBe('confirmed,scheduled');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Vencimiento' }),
      'Cualquier vencimiento',
    );
    await waitFor(() => expect(lastQuery().has('due')).toBe(false));
    expect(lastQuery().get('status')).toBe('confirmed,scheduled');
  });

  it('AC-006-04 escribir una OC o una factura filtra la lista', async () => {
    const { lastQuery, user } = setup('/expedientes');
    await user.type(screen.getByLabelText('Orden de compra'), 'OC-1002');
    await user.type(screen.getByLabelText('Factura'), 'A-100');
    await waitFor(() => expect(lastQuery().get('poNumber')).toBe('OC-1002'));
    await waitFor(() => expect(lastQuery().get('invoiceNumber')).toBe('A-100'));
  });
});

import type { ReceiptOrderDto } from '@mimark/contracts/receipts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { ReceiptsPage } from './ReceiptsPage';

const order = (over: Partial<ReceiptOrderDto> = {}): ReceiptOrderDto => ({
  id: 'o1',
  number: 'OC-1003',
  supplierName: 'Empaques del Norte',
  issuedOn: '2026-10-08',
  receiptStatus: 'pending',
  receivedOn: null,
  receivedBy: null,
  receiptNotes: null,
  lines: [
    { id: 'l1', position: 1, sku: 'CAF-1', description: 'Café', quantity: '10', unit: 'caja' },
    { id: 'l2', position: 2, sku: null, description: 'Vasos', quantity: '4', unit: 'caja' },
  ],
  ...over,
});

function setup(items: ReceiptOrderDto[] = [order()]) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  setViewport(1440);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ReceiptsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, user: userEvent.setup() };
}

afterEach(() => vi.unstubAllGlobals());

describe('ReceiptsPage', () => {
  it('AC-017-12 lista folio, proveedor, fecha y número de partidas, sin precios ni totales', async () => {
    setup();
    const row = await screen.findByRole('row', { name: /OC-1003/ });
    expect(row).toHaveTextContent('Empaques del Norte');
    expect(row).toHaveTextContent('8 oct');
    expect(row).toHaveTextContent('2');
    expect(screen.queryByRole('columnheader', { name: /total|precio|importe/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$|MXN|USD/);
  });

  it('AC-017-12 «Por recibir» pide los pendientes y «Recibidas» cambia el filtro', async () => {
    const { fetchMock, user } = setup();
    await screen.findByText('OC-1003');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/receipts?status=pending');
    await user.click(screen.getByRole('tab', { name: 'Recibidas' }));
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/receipts?status=received'),
    );
    expect(screen.queryByRole('button', { name: 'Recibir' })).toBeNull();
  });

  it('AC-017-12 la búsqueda filtra por folio o proveedor en la API', async () => {
    const { fetchMock, user } = setup();
    await screen.findByText('OC-1003');
    await user.type(screen.getByRole('textbox', { name: 'Buscar por folio o proveedor' }), 'norte');
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/receipts?status=pending&search=norte'),
    );
  });

  it('AC-017-12 «Recibir» abre el checklist de las partidas', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Recibir' }));
    expect(
      await screen.findByRole('dialog', { name: /Confirmar recepción de OC-1003/ }),
    ).toBeVisible();
    expect(screen.getByText('0 de 2 recibidas')).toBeInTheDocument();
  });

  it('AC-017-12 sin pendientes lo dice', async () => {
    setup([]);
    expect(await screen.findByText('No hay órdenes por recibir.')).toBeInTheDocument();
  });
});

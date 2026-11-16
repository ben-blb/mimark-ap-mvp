import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionKey } from '../session/session.api';
import { setViewport } from '../../test/setup';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';

const order = {
  id: 'o1',
  number: 'OC-1003',
  supplier: { id: 's1', name: 'Empaques', taxId: 'EDR150720QW9', creditDays: 7 },
  issuedOn: '2026-10-08',
  total: '3480.00',
  taxes: null,
  currency: 'MXN',
  parlevelRef: null,
  lines: [],
  linesSubtotal: '0.00',
  receivedSubtotal: null,
  progress: { stage: 'to_receive', invoice: null },
  status: 'open',
  receiptStatus: 'pending',
  receivedOn: null,
  receivedBy: null,
  receiptNotes: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('PurchaseOrdersPage', () => {
  it('AC-017-13 ya no ofrece «Confirmar recepción», ni siquiera a quien puede recibir', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [order] }), {
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
      actor: 'Ana',
      role: 'admin',
      mustChangePassword: false,
      expiresAt: '2026-10-28T00:00:00.000Z',
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PurchaseOrdersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('OC-1003')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar recepción/ })).toBeNull();
  });

  it('AC-018-13 muestra «con diferencias» con tono de aviso y ofrece el filtro; la vista llega por la URL', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              { ...order, receiptStatus: 'received_with_differences', receivedOn: '2026-10-10' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    setViewport(1440);
    const client = new QueryClient();
    client.setQueryData(sessionKey, {
      userId: 'u1',
      actor: 'Ana',
      role: 'admin',
      mustChangePassword: false,
      expiresAt: '2026-10-28T00:00:00.000Z',
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/ordenes?view=openDifferences']}>
          <PurchaseOrdersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/con diferencias/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toContain('receipt=received_with_differences');
    expect(
      screen.getByRole('option', { name: 'Abiertas · recibidas con diferencias' }),
    ).toBeInTheDocument();
  });
});

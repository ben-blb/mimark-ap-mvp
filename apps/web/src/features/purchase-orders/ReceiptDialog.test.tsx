import type { PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDialog } from './ReceiptDialog';

const line = (n: number) => ({
  id: `l${n}`,
  position: n,
  sku: n === 1 ? 'CAF-1' : null,
  description: `Producto ${n}`,
  quantity: String(n * 10),
  unit: 'caja',
  unitPrice: '50',
  amount: '500.00',
});

const order = (lines = 3): PurchaseOrderDto => ({
  id: 'o1',
  number: 'OC-1003',
  supplier: { id: 's1', name: 'Empaques', taxId: 'EDR150720QW9', creditDays: 7 },
  issuedOn: '2026-10-08',
  total: '3480.00',
  taxes: '480.00',
  currency: 'MXN',
  parlevelRef: null,
  lines: Array.from({ length: lines }, (_, i) => line(i + 1)),
  status: 'open',
  receiptStatus: 'pending',
  receivedOn: null,
  receivedBy: null,
  receiptNotes: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
});

function setup(po = order()) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ ...po, receiptStatus: 'received' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReceiptDialog order={po} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { fetchMock, onClose, user: userEvent.setup() };
}

afterEach(() => vi.unstubAllGlobals());

describe('ReceiptDialog · checklist', () => {
  it('AC-014-14 lista cada partida y no deja confirmar hasta marcarlas todas', async () => {
    const { user } = setup();
    const confirm = screen.getByRole('button', { name: 'Confirmar recepción' });
    expect(screen.getByText('0 de 3 recibidas')).toBeInTheDocument();
    expect(screen.getByText('CAF-1 · 10 caja')).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText('Producto 1'));
    await user.click(screen.getByLabelText('Recibida: Producto 2'));
    expect(screen.getByText('2 de 3 recibidas')).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText('Producto 3'));
    expect(screen.getByText('3 de 3 recibidas')).toBeInTheDocument();
    expect(confirm).toBeEnabled();
  });

  it('AC-014-14 «Marcar todo» marca el resto y desmarcar una vuelve a bloquear', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Marcar todo' }));
    expect(screen.getByText('3 de 3 recibidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todo' })).toBeDisabled();
    await user.click(screen.getByText('Producto 2'));
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toBeDisabled();
  });

  it('AC-014-14 envía los ids de todas las partidas marcadas', async () => {
    const { fetchMock, onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Marcar todo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/purchase-orders/o1/receipt');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      checkedLineIds: ['l1', 'l2', 'l3'],
    });
  });

  it('AC-014-14 una OC sin partidas se confirma como en la spec 003, sin checklist', async () => {
    const { fetchMock, user } = setup(order(0));
    expect(screen.queryByRole('list', { name: 'Partidas por recibir' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toMatchObject({
      checkedLineIds: [],
    });
  });
});

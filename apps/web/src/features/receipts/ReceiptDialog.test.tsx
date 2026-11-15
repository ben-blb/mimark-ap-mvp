import type { ReceiptOrderDto } from '@mimark/contracts/receipts';
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
  receivedQuantity: null,
});

const order = (lines = 3): ReceiptOrderDto => ({
  id: 'o1',
  number: 'OC-1003',
  supplierName: 'Empaques',
  issuedOn: '2026-10-08',
  receiptStatus: 'pending',
  receivedOn: null,
  receivedBy: null,
  receiptNotes: null,
  lines: Array.from({ length: lines }, (_, i) => line(i + 1)),
});

function setup(po = order()) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ id: po.id }), {
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
  const body = () => JSON.parse(fetchMock.mock.calls[0]![1]?.body as string);
  return { fetchMock, onClose, body, user: userEvent.setup() };
}

const received = (n: number) => screen.getByRole('textbox', { name: `Recibido: Producto ${n}` });

afterEach(() => vi.unstubAllGlobals());

describe('ReceiptDialog · cantidades por partida', () => {
  it('AC-018-11 una fila por partida con lo pedido y lo recibido precargado', () => {
    setup();
    expect(screen.getByText('CAF-1 · Pedido 10 caja')).toBeInTheDocument();
    expect(screen.getByText('Pedido 20 caja')).toBeInTheDocument();
    expect(received(1)).toHaveValue('10');
    expect(received(3)).toHaveValue('30');
    expect(screen.getByText('3 de 3 completas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toBeEnabled();
  });

  it('AC-018-11 − baja, + sube sin pasar de lo pedido, y «Todo llegó completo» restaura', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Menos: Producto 1' }));
    expect(received(1)).toHaveValue('9');
    expect(screen.getByText('2 de 3 completas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Más: Producto 2' }));
    expect(received(2)).toHaveValue('20');

    await user.click(screen.getByRole('button', { name: 'Todo llegó completo' }));
    expect(received(1)).toHaveValue('10');
    expect(screen.getByText('3 de 3 completas')).toBeInTheDocument();
  });

  it('AC-018-12 con una diferencia: «Faltan 5», notas obligatorias y botón «Confirmar con diferencias»', async () => {
    const { fetchMock, onClose, body, user } = setup();
    await user.clear(received(1));
    await user.type(received(1), '5');
    expect(screen.getByText('Faltan 5')).toBeInTheDocument();
    expect(screen.getByText('Explica qué faltó')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar recepción' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Confirmar con diferencias' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /Notas/ }), 'Llegó corta');
    await user.click(screen.getByRole('button', { name: 'Confirmar con diferencias' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/purchase-orders/o1/receipt');
    expect(body()).toMatchObject({
      notes: 'Llegó corta',
      lines: [
        { lineId: 'l1', receivedQuantity: '5' },
        { lineId: 'l2', receivedQuantity: '20' },
        { lineId: 'l3', receivedQuantity: '30' },
      ],
    });
  });

  it('AC-018-12 sin diferencias envía lo pedido y las notas son opcionales', async () => {
    const { onClose, body, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body().lines).toEqual([
      { lineId: 'l1', receivedQuantity: '10' },
      { lineId: 'l2', receivedQuantity: '20' },
      { lineId: 'l3', receivedQuantity: '30' },
    ]);
  });

  it('AC-018-11 no deja confirmar con más de lo pedido o con todo en 0', async () => {
    const { user } = setup(order(1));
    await user.clear(received(1));
    await user.type(received(1), '11');
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toBeDisabled();
    await user.clear(received(1));
    await user.type(received(1), '0');
    expect(screen.getByRole('button', { name: 'Confirmar con diferencias' })).toBeDisabled();
  });

  it('AC-014-14 una OC sin partidas se confirma sin lista y con lines vacío', async () => {
    const { fetchMock, body, user } = setup(order(0));
    expect(screen.queryByRole('list', { name: 'Partidas por recibir' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(body()).toMatchObject({ lines: [] });
  });
});

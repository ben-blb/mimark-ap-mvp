import type { Role } from '@mimark/contracts/session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { sessionKey } from '../session/session.api';
import { MyWorkPage } from './MyWorkPage';

const payable = (i: number, over: Record<string, unknown> = {}) => ({
  id: `p${i}`,
  status: 'requires_review',
  createdBy: 'Ana',
  createdAt: '2026-10-01T10:00:00.000Z',
  reviewReasons: [],
  fileName: `f${i}.pdf`,
  supplierName: `Proveedor ${i}`,
  invoiceNumber: `F-${i}`,
  poNumber: null,
  total: '100.00',
  currency: 'MXN',
  dueOn: '2026-11-01',
  scheduledPayOn: null,
  ...over,
});
const poLine = (position: number, quantity: string) => ({
  id: `l${position}`,
  position,
  sku: null,
  description: `Partida ${position}`,
  quantity,
  unit: 'caja',
  unitPrice: '1.00',
  amount: '1.00',
});
const po = (i: number) => ({
  id: `o${i}`,
  number: `OC-${i}`,
  supplier: { id: 's', name: `Prov ${i}`, taxId: 'X', creditDays: 0 },
  issuedOn: '2026-10-08',
  total: '116.00',
  taxes: null,
  currency: 'MXN',
  parlevelRef: null,
  lines: [
    { ...poLine(1, '75'), receivedQuantity: '70' },
    { ...poLine(2, '40'), receivedQuantity: '40' },
  ],
  linesSubtotal: '1.00',
  receivedSubtotal: null,
  progress: { stage: 'to_receive', invoice: null },
  status: 'open',
  receiptStatus: 'pending',
  receivedOn: null,
  receivedBy: null,
  receiptNotes: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
});

/** Responde cada listado según su URL; lo que no esté en `data` llega vacío. */
function setup(role: Role, data: Record<string, unknown[]> = {}) {
  const fetchMock = vi.fn((url: string) => {
    const items = Object.entries(data).find(([prefix]) => url.startsWith(prefix))?.[1] ?? [];
    return Promise.resolve(
      new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  setViewport(1440);
  const client = new QueryClient();
  client.setQueryData(sessionKey, {
    userId: 'u1',
    actor: 'Ana',
    role,
    mustChangePassword: false,
    expiresAt: '2026-10-28T00:00:00.000Z',
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyWorkPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const block = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

describe('MyWorkPage', () => {
  it('AC-017-10 cuentas por pagar ve sus cuatro bloques, no las órdenes por recibir', async () => {
    const fetchMock = setup('payables');
    await screen.findAllByText('Nada pendiente');
    for (const name of [
      'Facturas por revisar',
      'Por confirmar',
      'Por programar',
      'Pagos programados',
    ]) {
      expect(block(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole('region', { name: /Órdenes por recibir/ })).toBeNull();
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/api/purchase-orders'))).toBe(false);
  });

  it('AC-017-10 compras ve solo «Órdenes por recibir» y no consulta facturas', async () => {
    const fetchMock = setup('purchasing', {
      '/api/purchase-orders?status=open&receipt=pending': [po(1), po(2)],
    });
    expect(await screen.findByText('OC-1 · Prov 1')).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(block('Órdenes por recibir')).toHaveTextContent('2');
    expect(fetchMock.mock.calls.some((c) => c[0].startsWith('/api/payables'))).toBe(false);
    expect(
      within(block('Órdenes por recibir')).getByRole('link', { name: /Ver todas/ }),
    ).toHaveAttribute('href', '/ordenes?view=openPending');
  });

  it('AC-018-14 compras ve «Recibidas con diferencias» con las órdenes en ese estado', async () => {
    const fetchMock = setup('purchasing', {
      '/api/purchase-orders?status=open&receipt=received_with_differences': [
        { ...po(7), receiptStatus: 'received_with_differences' },
      ],
    });
    const differences = await screen.findByRole('region', { name: /Recibidas con diferencias/ });
    expect(await within(differences).findByText('OC-7 · Prov 7')).toBeInTheDocument();
    expect(differences).toHaveTextContent('1 partida con diferencia');
    expect(within(differences).getByRole('link', { name: /Ver todas/ })).toHaveAttribute(
      'href',
      '/ordenes?view=openDifferences',
    );
    expect(
      fetchMock.mock.calls.some((c) => c[0].includes('receipt=received_with_differences')),
    ).toBe(true);
  });

  it('AC-018-14 un rol sin orders:write no ve el bloque', async () => {
    setup('payables');
    await screen.findAllByText('Nada pendiente');
    expect(screen.queryByRole('region', { name: /Recibidas con diferencias/ })).toBeNull();
  });

  it('AC-017-10 muestra hasta 5 filas, la cuenta completa y «Ver todas» a la lista filtrada', async () => {
    setup('payables', {
      '/api/payables?status=requires_review': Array.from({ length: 7 }, (_, i) => payable(i + 1)),
    });
    const review = await screen.findByRole('region', { name: /Facturas por revisar/ });
    await within(review).findByText('Proveedor 1');
    expect(within(review).getAllByRole('listitem')).toHaveLength(5);
    expect(review).toHaveTextContent('7');
    expect(within(review).getByRole('link', { name: /Ver todas/ })).toHaveAttribute(
      'href',
      '/expedientes?status=requires_review',
    );
    expect(within(review).getByRole('link', { name: /Proveedor 1/ })).toHaveAttribute(
      'href',
      '/expedientes/p1',
    );
  });

  it('AC-017-10 los pagos programados salen con su fecha de pago y la más próxima (vencida) primero', async () => {
    setup('payables', {
      '/api/payables?status=scheduled': [
        payable(1, { status: 'scheduled', scheduledPayOn: '2026-12-01' }),
        payable(2, { status: 'scheduled', scheduledPayOn: '2026-10-01' }),
      ],
    });
    const scheduled = await screen.findByRole('region', { name: /Pagos programados/ });
    await within(scheduled).findByText('Proveedor 1');
    expect(scheduled).toHaveTextContent(/pago 1 oct/);
    expect(
      within(scheduled)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.slice(0, 11)),
    ).toEqual(['Proveedor 2', 'Proveedor 1']);
  });

  it('AC-017-11 un bloque vacío dice «Nada pendiente» y los demás siguen', async () => {
    setup('payables', { '/api/payables?status=confirmed': [payable(1, { status: 'confirmed' })] });
    await screen.findByText('Proveedor 1');
    expect(within(block('Facturas por revisar')).getByText('Nada pendiente')).toBeInTheDocument();
    expect(within(block('Por programar')).queryByText('Nada pendiente')).toBeNull();
    expect(screen.queryByText('Estás al día')).toBeNull();
  });

  it('AC-017-11 con todo vacío dice «Estás al día»', async () => {
    setup('payables');
    expect(await screen.findByText('Estás al día')).toBeInTheDocument();
    expect(screen.getAllByText('Nada pendiente')).toHaveLength(4);
  });
});

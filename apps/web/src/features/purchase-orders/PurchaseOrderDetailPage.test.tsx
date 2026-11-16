import type { Role } from '@mimark/contracts/session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionKey } from '../session/session.api';
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage';

const line = (n: number, quantity: string, receivedQuantity: string | null) => ({
  id: `l${n}`,
  position: n,
  sku: `SKU-${n}`,
  description: `Producto ${n}`,
  quantity,
  unit: 'caja',
  unitPrice: '10.00',
  amount: '10.00',
  receivedQuantity,
});

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  number: 'OC-3062',
  supplier: { id: 's1', name: 'Pepsi Bebidas', taxId: 'PBE010101AA1', creditDays: 30 },
  issuedOn: '2026-10-08',
  total: '17646.50',
  taxes: null,
  currency: 'MXN',
  parlevelRef: null,
  lines: [line(1, '75', '70'), line(2, '40', '40')],
  linesSubtotal: '15212.50',
  receivedSubtotal: '14465.00',
  progress: { stage: 'to_invoice', invoice: null },
  status: 'open',
  receiptStatus: 'received_with_differences',
  receivedOn: '2026-10-10',
  receivedBy: 'Wanda',
  receiptNotes: 'Faltaron 5 cajas',
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  ...over,
});

function setup(role: Role, data: Record<string, unknown> = order()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
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
      <MemoryRouter initialEntries={['/ordenes/o1']}>
        <Routes>
          <Route path="/ordenes/:id" element={<PurchaseOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const steps = () => within(screen.getByRole('list', { name: 'Avance de la orden' }));

describe('PurchaseOrderDetailPage', () => {
  it('AC-019-10 la barra marca los pasos cumplidos con su fecha y el actual con la etapa', async () => {
    setup('payables');
    await screen.findByRole('heading', { name: 'Orden OC-3062' });
    const items = steps().getAllByRole('listitem');
    expect(items).toHaveLength(6);
    ['Creada', 'Recibida', 'Lista para factura', 'Confirmada', 'Programada', 'Pagada'].forEach(
      (text, i) => expect(items[i]).toHaveTextContent(text),
    );
    expect(items[0]).toHaveTextContent('8 oct');
    expect(items[1]).toHaveTextContent('10 oct');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((i) => i.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('AC-019-10 una orden cancelada muestra «Cancelada» en lugar de la barra', async () => {
    setup(
      'payables',
      order({ status: 'cancelled', progress: { stage: 'cancelled', invoice: null } }),
    );
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Avance de la orden' })).toBeNull();
  });

  it('AC-019-11 muestra proveedor, crédito, partidas pedido/recibido con la diferencia marcada y quién recibió', async () => {
    setup('payables');
    expect(await screen.findByText('Pepsi Bebidas')).toBeInTheDocument();
    expect(screen.getByText(/Crédito 30 días/)).toBeInTheDocument();
    expect(screen.getByText(/Pedido 75 · Recibido 70 caja · Faltan 5/)).toBeInTheDocument();
    expect(screen.getByText(/Pedido 40 · Recibido 40 caja$/)).toBeInTheDocument();
    expect(screen.getByText(/por Wanda · Faltaron 5 cajas/)).toBeInTheDocument();
  });

  it('AC-019-11 un proveedor de contado dice «Contado»', async () => {
    setup('payables', order({ supplier: { id: 's1', name: 'Pepsi', taxId: 'X', creditDays: 0 } }));
    expect(await screen.findByText(/Contado/)).toBeInTheDocument();
  });

  it.each([
    ['payables', 'to_invoice', { name: 'Cargar factura' }],
    ['purchasing', 'to_receive', { name: 'Editar' }],
  ] as const)('AC-019-12 %s ve la acción del paso %s', async (role, stage, button) => {
    setup(role, order({ progress: { stage, invoice: null } }));
    expect(await screen.findByRole('button', button)).toBeInTheDocument();
  });

  it('AC-019-12 sin permiso para el paso dice quién sigue', async () => {
    setup('purchasing');
    expect(await screen.findByText('Esperando a Cuentas por pagar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar factura' })).toBeNull();
  });

  it('AC-019-12 Cuentas por pagar no edita una orden por recibir: espera a Almacén', async () => {
    setup('payables', order({ progress: { stage: 'to_receive', invoice: null } }));
    expect(await screen.findByText('Esperando a Almacén')).toBeInTheDocument();
  });

  it('AC-019-12 con factura en revisión, quien puede leer expedientes ve «Ver factura»', async () => {
    setup(
      'payables',
      order({
        progress: {
          stage: 'in_review',
          invoice: {
            payableId: 'p9',
            status: 'requires_review',
            invoiceNumber: 'F-1',
            dueOn: null,
            scheduledPayOn: null,
            paidOn: null,
          },
        },
      }),
    );
    expect(await screen.findByRole('link', { name: 'Ver factura' })).toHaveAttribute(
      'href',
      '/expedientes/p9',
    );
  });

  it('AC-019-13 «Cargar factura» abre la subida con la orden elegida y no editable', async () => {
    setup('payables');
    (await screen.findByRole('button', { name: 'Cargar factura' })).click();
    const dialog = await screen.findByRole('dialog', { name: 'Subir documento' });
    const select = within(dialog).getByRole('combobox', { name: 'Orden de compra' });
    expect(select).toBeDisabled();
    expect(select).toHaveValue('OC-3062');
  });
});

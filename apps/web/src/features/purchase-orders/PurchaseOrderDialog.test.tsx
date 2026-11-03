import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const supplier = {
  id: 's1',
  name: 'Café Sierra Madre',
  taxId: 'CSM120304TR5',
  creditDays: 0,
  currency: 'MXN',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const draft = {
  number: 'OC-3001',
  supplierName: supplier.name,
  supplierTaxId: supplier.taxId,
  supplier: {
    id: 's1',
    name: supplier.name,
    taxId: supplier.taxId,
    creditDays: 0,
    currency: 'MXN',
  },
  issuedOn: '2026-10-19',
  currency: 'MXN',
  parlevelRef: null,
  lines: [
    {
      sku: 'CAF-1',
      description: 'Café 1 kg',
      quantity: '20',
      unit: 'bolsa',
      unitPrice: '100',
      statedAmount: '2000.00',
    },
  ],
  subtotal: '2000.00',
  taxes: '320.00',
  total: '2320.00',
  uncertainFields: [],
  warnings: [],
};

function setup(extractResponse: () => Response) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/suppliers')) return Promise.resolve(json({ items: [supplier] }));
    if (url === '/api/purchase-orders/extract') return Promise.resolve(extractResponse());
    if (url === '/api/purchase-orders' && init?.method === 'POST') {
      return Promise.resolve(json({ id: 'new' }, 201));
    }
    return Promise.reject(new Error(`sin respuesta para ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PurchaseOrderDialog onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return { fetchMock, user: userEvent.setup({ applyAccept: false }) };
}

afterEach(() => vi.unstubAllGlobals());

const pdf = new File(['%PDF-1.7'], 'oc.pdf', { type: 'application/pdf' });

describe('PurchaseOrderDialog · PDF de ParLevel', () => {
  it('AC-014-12 ofrece subir el PDF o capturar a mano', () => {
    setup(() => json(draft));
    expect(screen.getByText('Subir PDF de ParLevel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capturar a mano' })).toBeInTheDocument();
  });

  it('AC-014-12 el PDF abre el paso de verificación y solo se guarda al confirmar ahí', async () => {
    const { fetchMock, user } = setup(() => json(draft, 201));
    await user.upload(screen.getByLabelText('Archivo PDF de ParLevel'), pdf);

    expect(await screen.findByText('Verificar la orden leída del PDF')).toBeInTheDocument();
    expect(screen.getByLabelText('Folio')).toHaveValue('OC-3001');
    const created = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) => url === '/api/purchase-orders' && init?.method === 'POST',
      );
    expect(created()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(created()).toHaveLength(1));
    const body = JSON.parse(created()[0]![1]?.body as string);
    expect(body).toMatchObject({ number: 'OC-3001', supplierId: 's1', total: '2320.00' });
    expect(body.lines).toEqual([
      { sku: 'CAF-1', description: 'Café 1 kg', quantity: '20', unit: 'bolsa', unitPrice: '100' },
    ]);
  });

  it('AC-014-12 si la lectura falla muestra el error y deja capturar a mano', async () => {
    const { user } = setup(() =>
      json({ code: 'AI_UNAVAILABLE', message: 'La IA no está disponible.', requestId: 'r1' }, 502),
    );
    await user.upload(screen.getByLabelText('Archivo PDF de ParLevel'), pdf);
    expect(await screen.findByText(/La IA no está disponible/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Capturar a mano' }));
    expect(await screen.findByLabelText('Folio')).toHaveValue('');
  });
});

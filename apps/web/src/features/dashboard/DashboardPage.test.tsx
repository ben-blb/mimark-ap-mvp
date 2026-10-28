import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const bucket = { count: 0, amount: { MXN: '0.00', USD: '0.00' } };
const dto = (horizon: number, invoice: string) => ({
  today: '2026-10-20',
  horizon,
  totals: { pending: bucket, overdue: bucket, upcoming: bucket, paidThisMonth: bucket },
  inReview: 0,
  byPayDay: [],
  items: [
    {
      id: invoice,
      supplierName: 'Proveedor',
      invoiceNumber: invoice,
      total: '100.00',
      currency: 'MXN',
      dueOn: '2026-10-25',
      payOn: '2026-10-28',
      status: 'confirmed',
      urgent: false,
      overdue: false,
    },
  ],
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function setup() {
  let resolveSlow: (response: Response) => void = () => undefined;
  const slow = {
    promise: new Promise<Response>((resolve) => (resolveSlow = resolve)),
    resolve: (response: Response) => resolveSlow(response),
  };
  const fetchMock = vi.fn((url: string) =>
    url.includes('horizon=30') ? slow.promise : Promise.resolve(json(dto(15, 'A-100'))),
  );
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, slow, user: userEvent.setup() };
}

afterEach(() => vi.unstubAllGlobals());

describe('DashboardPage', () => {
  it('AC-006-06 pide el tablero con el horizonte elegido, sin recargar la página', async () => {
    const { fetchMock, slow, user } = setup();
    expect(await screen.findByText('A-100')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/dashboard?horizon=15');

    await user.click(screen.getByRole('tab', { name: '30 días' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?horizon=30', expect.anything()),
    );

    // Mientras llega el nuevo se sigue viendo el anterior: no se vacía ni parpadea.
    expect(screen.getByText('A-100')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '30 días' })).toHaveAttribute('aria-selected', 'true');

    slow.resolve(json(dto(30, 'B-200')));
    expect(await screen.findByText('B-200')).toBeInTheDocument();
    expect(screen.queryByText('A-100')).not.toBeInTheDocument();
  });
});

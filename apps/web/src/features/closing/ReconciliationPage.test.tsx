import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirePermission } from '../../app/RequirePermission';
import { setViewport } from '../../test/setup';
import { sessionKey } from '../session/session.api';
import { ReconciliationPage } from './ReconciliationPage';

const stamp = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const company = { id: 'co1', name: 'Quima Tlalnepantla', active: true, ...stamp };
const openPeriod = {
  id: 'p1',
  companyId: 'co1',
  month: '2026-09',
  status: 'open',
  closedBy: null,
  closedAt: null,
  reopenReason: null,
};
const day = (date: string, status: string, over: Record<string, unknown> = {}) => ({
  date,
  groupedDays: [],
  sales: '8336.50',
  commission: '283.44',
  vat: '45.35',
  expected: '8007.71',
  deposit: '8007.71',
  difference: '0.00',
  status,
  ...over,
});
const check = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Cuadre ${id}`,
  status,
  valueA: '100.00',
  valueB: '100.00',
  difference: '0.00',
  message: `Mensaje de ${id}`,
  entryIds: [],
  ...over,
});

const reviewItem = (id: string) => ({
  id,
  companyId: 'co1',
  month: '2026-09',
  date: '2026-09-10',
  kioskId: null,
  accountId: null,
  source: 'cash',
  uploadId: null,
  rowNumber: null,
  concept: 'Caja',
  amount: '-10.00',
  categoryId: null,
  kind: 'normal',
  needsReview: true,
  meta: null,
  reason: 'no_rule',
  suggestedCategoryId: null,
  possibleTransferWith: null,
});

let period: unknown = openPeriod;
let checks: unknown[] = [];
let pending: unknown[] = [];
const calls: { method: string; url: string; body?: unknown }[] = [];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const json = (data: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      if (method === 'POST') return json({ ...openPeriod, status: 'closed', closedBy: 'Ana' });
      const path = url.split('?')[0] ?? '';
      if (path === '/api/closing/companies') return json({ items: [company] });
      if (path === '/api/closing/periods') return json({ items: period ? [period] : [] });
      if (path === '/api/closing/periods/p1/cantaloupe') {
        return json({
          rate: '0.0340',
          items: [
            day('2026-09-01', 'ok'),
            day('2026-09-07', 'warning', {
              groupedDays: ['2026-09-05', '2026-09-06', '2026-09-07'],
              difference: '0.83',
            }),
            day('2026-09-08', 'missing', { deposit: '0.00', difference: '-8007.71' }),
          ],
        });
      }
      if (path === '/api/closing/periods/p1/checks') return json({ items: checks });
      if (path === '/api/closing/review') return json({ items: pending, transfers: [] });
      return json({ items: [] });
    }),
  );
}

function setup(role: 'admin' | 'manager' = 'admin') {
  calls.length = 0;
  stubApi();
  setViewport(1440);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
        <RequirePermission permission="reports:read">
          <ReconciliationPage />
        </RequirePermission>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  vi.unstubAllGlobals();
  period = openPeriod;
  checks = [];
  pending = [];
});

describe('ReconciliationPage (spec 023)', () => {
  it('AC-023-18 la tabla de Cantaloupe muestra cada día con su estado en texto', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Conciliación de Cantaloupe' });
    await within(table).findByText('Sin depósito');
    const text = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(text.some((t) => t?.includes('1 sep 2026') && t.includes('Conciliado'))).toBe(true);
    expect(text.some((t) => t?.includes('7 sep 2026') && t.includes('Con diferencia'))).toBe(true);
    expect(text.some((t) => t?.includes('8 sep 2026') && t.includes('Sin depósito'))).toBe(true);
    expect(
      within(table).getByText(/Incluye 5 sep 2026, 6 sep 2026, 7 sep 2026/),
    ).toBeInTheDocument();
    expect(within(table).getAllByText('$8,007.71').length).toBeGreaterThan(0);
  });

  it('AC-023-18 el panel de cuadres muestra el semáforo en texto y el cierre se deshabilita con su motivo', async () => {
    checks = [check('sales', 'ok'), check('uncategorized', 'error', { entryIds: ['e1', 'e2'] })];
    pending = [reviewItem('e1')];
    setup();

    const panel = await screen.findByRole('list', { name: 'Cuadres del cierre' });
    expect(await within(panel).findByText('Cuadra')).toBeInTheDocument();
    expect(within(panel).getByText('No cuadra')).toBeInTheDocument();
    expect(within(panel).getByText('2 movimiento(s) involucrados')).toBeInTheDocument();
    const button = await screen.findByRole('button', { name: 'Cerrar periodo' });
    expect(
      await screen.findByText(
        'No se puede cerrar: hay 1 cuadre(s) que no cuadran y 1 movimiento(s) por revisar.',
      ),
    ).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription(/No se puede cerrar/);
  });

  it('AC-023-18 con todo cuadrado, «Cerrar periodo» se habilita y cierra', async () => {
    checks = [check('sales', 'ok'), check('bank_balance:a1', 'warning')];
    const user = setup();

    const button = await screen.findByRole('button', { name: 'Cerrar periodo' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByText('Todo cuadra: ya se puede cerrar.')).toBeInTheDocument();
    await user.click(button);
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        url: '/api/closing/periods/p1/close',
        body: {},
      }),
    );
  });

  it('AC-023-15 un periodo cerrado dice quién lo cerró y se reabre con un motivo', async () => {
    period = { ...openPeriod, status: 'closed', closedBy: 'Ana' };
    const user = setup();

    expect(await screen.findByText(/Cerrado por Ana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar periodo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reabrir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir periodo' });
    const confirm = within(dialog).getByRole('button', { name: 'Reabrir' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motivo'), 'Faltó una nómina');
    await user.click(confirm);
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        url: '/api/closing/periods/p1/reopen',
        body: { reason: 'Faltó una nómina' },
      }),
    );
  });

  it('AC-023-16 gerencia (spec 024) no entra a los cuadres: sin acceso y sin botón de cierre', async () => {
    checks = [check('sales', 'ok')];
    setup('manager');
    expect(await screen.findByText('Tu rol no tiene acceso a esta página.')).toBeInTheDocument();
    expect(screen.queryByText('Cuadra')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar periodo' })).not.toBeInTheDocument();
  });

  it('AC-023-18 un mes sin cargas lo dice en vez de mostrar tablas vacías', async () => {
    period = null;
    setup();
    expect(await screen.findByText(/Este mes todavía no tiene cargas/)).toBeInTheDocument();
  });
});

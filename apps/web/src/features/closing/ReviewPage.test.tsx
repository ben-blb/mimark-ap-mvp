import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirePermission } from '../../app/RequirePermission';
import { setViewport } from '../../test/setup';
import { sessionKey } from '../session/session.api';
import { ReviewPage } from './ReviewPage';

const stamp = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const company = { id: 'co1', name: 'Quima Tlalnepantla', active: true, ...stamp };
const account = (id: string, name: string) => ({
  id,
  companyId: 'co1',
  name,
  type: 'checking',
  last4: null,
  active: true,
  ...stamp,
});
const category = (id: string, name: string, sortOrder: number) => ({
  id,
  code: id.toUpperCase(),
  name,
  edoResLine: 'Rentas',
  kind: 'expense',
  sortOrder,
  active: true,
  ...stamp,
});
const period = {
  id: 'p1',
  companyId: 'co1',
  month: '2026-09',
  status: 'open',
  closedBy: null,
  closedAt: null,
  reopenReason: null,
};
const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  companyId: 'co1',
  month: '2026-09',
  date: '2026-09-10',
  kioskId: null,
  accountId: 'a1',
  source: 'bank_csv',
  uploadId: 'u1',
  rowNumber: 2,
  concept: 'PAGO SAMS CLUB 123',
  amount: '-120.00',
  categoryId: null,
  kind: 'normal',
  needsReview: true,
  meta: null,
  reason: 'no_rule',
  suggestedCategoryId: null,
  possibleTransferWith: null,
  ...over,
});

let items: unknown[] = [];
let transfers: unknown[] = [];
let currentPeriod: unknown = period;
const calls: { method: string; url: string; body?: unknown }[] = [];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url, body });
      const json = (data: unknown, status = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(data), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        );
      if (method === 'POST' && url === '/api/closing/entries/e1/classify-and-rule') {
        return json({ entry: entry('e1', { needsReview: false }), ruleId: 'r1', reclassified: 2 });
      }
      if (method === 'PATCH' && url === '/api/closing/entries/e1') {
        return json(entry('e1', { needsReview: false, categoryId: 'rentas' }));
      }
      if (method === 'POST' && url === '/api/closing/transfers') {
        return json({ id: 't1', entryIds: body.entryIds }, 201);
      }
      if (method === 'POST' && url === '/api/closing/periods/p1/classify') {
        return json({ classified: 3, needsReview: 1 });
      }
      const path = url.split('?')[0] ?? '';
      if (path === '/api/closing/companies') return json({ items: [company] });
      if (path === '/api/closing/accounts') {
        return json({ items: [account('a1', 'Cheques'), account('a2', 'Ahorro')] });
      }
      if (path === '/api/closing/categories') {
        return json({
          items: [category('rentas', 'Rentas', 10), category('gasolina', 'Gasolina', 20)],
        });
      }
      if (path === '/api/closing/periods') {
        return json({ items: currentPeriod ? [currentPeriod] : [] });
      }
      if (path === '/api/closing/review') return json({ items, transfers });
      return json({ items: [] });
    }),
  );
}

function setup(role: 'admin' | 'manager' = 'admin', status: 'open' | 'closed' = 'open') {
  items = [entry('e1', { concept: '=CMD() SAMS CLUB', suggestedCategoryId: 'gasolina' })];
  transfers = [];
  currentPeriod = { ...period, status, closedBy: status === 'closed' ? 'Ana' : null };
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
          <ReviewPage />
        </RequirePermission>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const ready = () => screen.findByRole('table', { name: 'Movimientos por revisar' });
afterEach(() => vi.unstubAllGlobals());

describe('ReviewPage (spec 023)', () => {
  it('AC-023-17 lista los movimientos con el concepto como texto, la fuente y la cuenta', async () => {
    setup();
    const table = await ready();
    const row = await within(table).findByRole('row', { name: /SAMS CLUB/ });
    expect(within(row).getByText('=CMD() SAMS CLUB')).toBeInTheDocument();
    expect(within(row).getByText('Banco')).toBeInTheDocument();
    expect(within(row).getByText('Cheques')).toBeInTheDocument();
    expect(within(row).getByText('Sin regla')).toBeInTheDocument();
  });

  it('AC-023-17 filtra por fuente y por cuenta', async () => {
    const user = setup();
    await ready();
    await user.selectOptions(screen.getByLabelText('Fuente'), 'bank_csv');
    await user.selectOptions(screen.getByLabelText('Cuenta'), 'a2');
    await waitFor(() =>
      expect(
        calls.some((c) => c.url.includes('source=bank_csv') && c.url.includes('accountId=a2')),
      ).toBe(true),
    );
  });

  it('AC-023-17 clasifica con el selector de categoría, que ya trae la sugerencia', async () => {
    const user = setup();
    await ready();
    const select = await screen.findByLabelText('Categoría de =CMD() SAMS CLUB');
    expect(select).toHaveValue('gasolina');
    await user.selectOptions(select, 'rentas');
    await user.click(screen.getByRole('button', { name: 'Clasificar =CMD() SAMS CLUB' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        url: '/api/closing/entries/e1',
        body: { categoryId: 'rentas' },
      }),
    );
  });

  it('AC-023-17 «Guardar como regla» manda el patrón recortado y avisa cuántos más se clasificaron', async () => {
    const user = setup();
    await ready();
    await user.click(
      await screen.findByRole('button', { name: 'Guardar como regla =CMD() SAMS CLUB' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Guardar como regla' });
    const pattern = within(dialog).getByLabelText('Patrón');
    await user.clear(pattern);
    await user.type(pattern, 'SAMS CLUB');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar regla' }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        url: '/api/closing/entries/e1/classify-and-rule',
        body: { categoryId: 'gasolina', pattern: 'SAMS CLUB' },
      }),
    );
    expect(await screen.findByText(/se clasificaron 2 movimientos más/)).toBeInTheDocument();
  });

  it('AC-023-17 un traspaso propuesto muestra los dos lados juntos y se confirma', async () => {
    const user = setup();
    items = [
      entry('e1', { concept: 'SPEI ENVIADO', amount: '-500.00', possibleTransferWith: 'e2' }),
      entry('e2', {
        concept: 'SPEI RECIBIDO',
        amount: '500.00',
        accountId: 'a2',
        possibleTransferWith: 'e1',
      }),
    ];
    transfers = [{ entryIds: ['e1', 'e2'] }];
    await ready();
    const section = await screen.findByRole('region', { name: 'Posibles traspasos' });
    expect(within(section).getByText('SPEI ENVIADO')).toBeInTheDocument();
    expect(within(section).getByText('SPEI RECIBIDO')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Confirmar traspaso' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        url: '/api/closing/transfers',
        body: { entryIds: ['e1', 'e2'] },
      }),
    );
  });

  it('AC-023-17 «Clasificar con reglas» avisa cuántos se clasificaron', async () => {
    const user = setup();
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Clasificar con reglas' }));
    expect(
      await screen.findByText(/Se clasificaron 3 movimientos con reglas; quedan 1 por revisar/),
    ).toBeInTheDocument();
  });

  it('AC-023-16 quien solo lee ve la cola sin controles para clasificar', async () => {
    setup('manager');
    await ready();
    expect(await screen.findByText('=CMD() SAMS CLUB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clasificar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar como regla/ })).not.toBeInTheDocument();
  });

  it('AC-023-05 un periodo cerrado avisa y no ofrece cambios', async () => {
    setup('admin', 'closed');
    await screen.findByText(/Este periodo está cerrado/);
    expect(screen.queryByRole('button', { name: /Clasificar/ })).not.toBeInTheDocument();
  });
});

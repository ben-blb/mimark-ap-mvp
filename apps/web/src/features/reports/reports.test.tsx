import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { DashboardPage } from '../dashboard/DashboardPage';
import { sessionKey } from '../session/session.api';
import { EdoResPage } from './EdoResPage';
import { KiosksPage } from './KiosksPage';
import { SuppliersReportPage } from './SuppliersPage';

const stamp = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const row = (key: string, label: string, kind: string, amount: string, line: string | null) => ({
  key,
  label,
  kind,
  line,
  amount,
  percentOfSales: kind === 'line' ? '10.00' : '100.00',
});
let status = 'provisional';
const edo = () => ({
  companyId: 'co1',
  month: '2026-09',
  status,
  compareTo: null,
  rows: [
    row('net_sales', 'Ventas netas', 'subtotal', '1000.00', null),
    row('Rentas', 'Rentas', 'line', '300.00', 'Rentas'),
    row('net_profit', 'Utilidad neta', 'total', '700.00', null),
  ],
});
const kioskRow = (id: string | null, name: string, margin: string, pct: string | null) => ({
  kioskId: id,
  name,
  sales: '100.00',
  cost: '50.00',
  margin,
  marginPercent: pct,
  waste: '0.00',
  theft: '0.00',
  commissions: '0.00',
  profitBeforeOverhead: margin,
  negativeMargin: Number(margin) < 0,
});
const zero = {
  sales: '0.00',
  cost: '0.00',
  margin: '0.00',
  waste: '0.00',
  theft: '0.00',
  commissions: '0.00',
  profitBeforeOverhead: '0.00',
};
const supplier = (name: string, total: string, count: number) => ({
  name,
  total,
  count,
  average: '10.00',
  percentOfSpend: '50.00',
  firstPaymentOn: '2026-09-02',
  lastPaymentOn: '2026-09-20',
});
const urls: string[] = [];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      const path = url.split('?')[0] ?? '';
      const body = (() => {
        if (path === '/api/reports/companies') {
          return { items: [{ id: 'co1', name: 'Quima', active: true, ...stamp }] };
        }
        if (path === '/api/reports/edo-res') return edo();
        if (path.startsWith('/api/reports/edo-res/lines/')) {
          return {
            line: 'Rentas',
            amount: '300.00',
            categories: [
              { code: 'RENTAS', name: 'Rentas locales', amount: '200.00', count: 1 },
              { code: 'RENTAS2', name: 'Rentas bodega', amount: '100.00', count: 1 },
            ],
            items: [
              {
                id: 'e1',
                date: '2026-09-03',
                concept: '=HYPERLINK("http://x")',
                kioskId: null,
                kioskName: 'Alfa',
                accountId: 'a1',
                accountName: 'Cheques',
                categoryCode: 'RENTAS',
                amount: '200.00',
                uploadId: 'u1',
                fileName: 'banco.csv',
                rowNumber: 4,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
          };
        }
        if (path === '/api/reports/kiosks') {
          return {
            companyId: 'co1',
            month: '2026-09',
            status,
            rows: [
              kioskRow('k1', 'Alfa', '40.00', '40.00'),
              kioskRow('k2', 'Beta', '-20.00', '-20.00'),
              kioskRow('k3', 'Gama', '10.00', '10.00'),
              kioskRow(null, 'Sin kiosko', '5.00', '5.00'),
            ],
            overhead: '43.00',
            unclassified: '0.00',
            totals: zero,
          };
        }
        if (path === '/api/reports/suppliers') {
          return {
            companyId: 'co1',
            month: '2026-09',
            status,
            totalSpend: '300.00',
            rows: [supplier('BIMBO', '100.00', 2), supplier('COCA COLA', '200.00', 5)],
          };
        }
        return { items: [] };
      })();
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

function setup(page: 'edo' | 'kioskos' | 'proveedores', width = 1440, role = 'manager') {
  urls.length = 0;
  stubApi();
  setViewport(width);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, {
    userId: 'u1',
    actor: 'Ana',
    role,
    mustChangePassword: false,
    expiresAt: '2026-12-28T00:00:00.000Z',
  });
  const path = { edo: 'edo-res', kioskos: 'kioskos', proveedores: 'proveedores' }[page];
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/reportes/${path}?month=2026-09`]}>
        <Routes>
          <Route path="/reportes/edo-res" element={<EdoResPage />} />
          <Route path="/reportes/kioskos" element={<KiosksPage />} />
          <Route path="/reportes/proveedores" element={<SuppliersReportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  vi.unstubAllGlobals();
  status = 'provisional';
});

describe('EDO RES (spec 024)', () => {
  it('AC-024-17 muestra los renglones con su porcentaje y el estado provisional en texto', async () => {
    setup('edo');
    const table = await screen.findByRole('table', { name: 'Estado de resultados' });
    expect(within(table).getByText('Ventas netas')).toBeInTheDocument();
    expect(within(table).getAllByText('10.00 %').length).toBeGreaterThan(0);
    expect(screen.getByText(/Provisional/)).toBeInTheDocument();
    expect(urls).toContain('/api/reports/edo-res?companyId=co1&month=2026-09');
  });

  it('AC-024-17 un periodo cerrado se marca como final', async () => {
    status = 'final';
    setup('edo');
    expect(await screen.findByText(/Final: el periodo está cerrado/)).toBeInTheDocument();
  });

  it('AC-024-17 cada importe de renglón abre sus partidas; el concepto se muestra como texto', async () => {
    const user = setup('edo');
    await user.click(await screen.findByRole('button', { name: /Ver partidas de Rentas/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('=HYPERLINK("http://x")')).toBeInTheDocument();
    expect(within(dialog).getByText('Alfa')).toBeInTheDocument();
    expect(within(dialog).getByText('Cheques')).toBeInTheDocument();
    expect(urls.some((u) => u.startsWith('/api/reports/edo-res/lines/Rentas/entries'))).toBe(true);
  });

  it('AC-024-08 el detalle trae el subtotal por categoría y AC-024-07 enlaza al archivo de origen', async () => {
    const user = setup('edo');
    await user.click(await screen.findByRole('button', { name: /Ver partidas de Rentas/ }));
    const dialog = await screen.findByRole('dialog');
    const subtotals = await within(dialog).findByRole('table', { name: 'Subtotal por categoría' });
    expect(within(subtotals).getByText('Rentas locales')).toBeInTheDocument();
    expect(within(subtotals).getByText('Rentas bodega')).toBeInTheDocument();
    const file = within(dialog).getByRole('link', { name: 'banco.csv' });
    expect(file).toHaveAttribute('href', '/api/reports/uploads/u1/file');
    expect(within(dialog).getByText(/fila 4/)).toBeInTheDocument();
  });

  it('AC-024-05 al comparar pide el mes anterior', async () => {
    const user = setup('edo');
    await screen.findByRole('table', { name: 'Estado de resultados' });
    await user.click(screen.getByRole('checkbox', { name: 'Comparar con el mes anterior' }));
    await waitFor(() => expect(urls.some((u) => u.includes('compareTo=2026-08'))).toBe(true));
  });

  it('AC-024-14 el botón exporta el mes elegido', async () => {
    setup('edo');
    const link = await screen.findByRole('link', { name: /Exportar a Excel/ });
    expect(link).toHaveAttribute('href', '/api/reports/edo-res/export?companyId=co1&month=2026-09');
  });

  it('AC-024-19 la tabla se desplaza dentro de su contenedor a 375 px, sin desbordar la página', async () => {
    setup('edo', 375);
    const table = await screen.findByRole('table', { name: 'Estado de resultados' });
    const container = table.parentElement as HTMLElement;
    expect(container).toHaveStyle({ overflowX: 'auto' });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('AC-024-17 un mes sin datos lo dice con todos los renglones en cero', async () => {
    status = 'empty';
    setup('edo');
    expect(await screen.findByText('Este mes todavía no tiene movimientos.')).toBeInTheDocument();
  });
});

describe('Kioskos (spec 024)', () => {
  const names = () =>
    within(screen.getByRole('table', { name: 'Rentabilidad por kiosko' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent);

  it('AC-024-10 ordena por margen y marca en texto los márgenes negativos; «Sin kiosko» va al final', async () => {
    const user = setup('kioskos');
    await screen.findByRole('table', { name: 'Rentabilidad por kiosko' });
    expect(names().slice(0, 3)).toEqual(['Beta Margen negativo', 'Gama', 'Alfa']);
    expect(names()[3]).toBe('Sin kiosko');
    expect(screen.getAllByText('Margen negativo')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '% margen' }));
    expect(names().slice(0, 3)).toEqual(['Alfa', 'Gama', 'Beta Margen negativo']);
  });

  it('AC-024-11 los gastos generales aparecen en su propia fila, sin asignar', async () => {
    setup('kioskos');
    const table = await screen.findByRole('table', { name: 'Rentabilidad por kiosko' });
    const rowEl = within(table).getByText('Gastos generales (sin asignar)').closest('tr');
    expect(within(rowEl as HTMLElement).getByText(/43\.00/)).toBeInTheDocument();
  });

  it('AC-024-18 los reportes se exportan desde el encabezado', async () => {
    setup('kioskos');
    expect(await screen.findByRole('link', { name: /Exportar a Excel/ })).toBeInTheDocument();
  });
});

describe('Proveedores (spec 024)', () => {
  const names = () =>
    within(screen.getByRole('table', { name: 'Pagos por proveedor' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent);

  it('AC-024-18 ordena por pago total y se puede reordenar por columna', async () => {
    const user = setup('proveedores');
    await screen.findByRole('table', { name: 'Pagos por proveedor' });
    expect(names()).toEqual(['COCA COLA', 'BIMBO']);
    await user.click(screen.getByRole('button', { name: 'Pagos' }));
    expect(names()).toEqual(['COCA COLA', 'BIMBO']);
    await user.click(screen.getByRole('button', { name: 'Pagos' }));
    expect(names()).toEqual(['BIMBO', 'COCA COLA']);
  });
});

describe('acceso desde el Tablero (spec 024)', () => {
  it('AC-024-16 gerencia ve el enlace a Reportes en el Tablero; otros roles no', () => {
    const dash = (role: string) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 500 }))),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(sessionKey, {
        userId: 'u1',
        actor: 'Ana',
        role,
        mustChangePassword: false,
        expiresAt: '2026-12-28T00:00:00.000Z',
      });
      return render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    };
    const manager = dash('manager');
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute(
      'href',
      '/reportes/edo-res',
    );
    manager.unmount();
    dash('payables');
    expect(screen.queryByRole('link', { name: 'Reportes' })).not.toBeInTheDocument();
  });
});

import type { DashboardDto } from '@mimark/contracts/dashboard';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { DashboardView, HorizonTabs } from './DashboardView';
import { dueBuckets } from './portfolio';

const bucket = (count: number, MXN: string, USD = '0.00') => ({ count, amount: { MXN, USD } });

const item = (over: Partial<DashboardDto['items'][number]>): DashboardDto['items'][number] => ({
  id: 'p1',
  supplierName: 'Distribuidora del Norte',
  invoiceNumber: 'A-100',
  total: '1000.00',
  currency: 'MXN',
  dueOn: '2026-10-15',
  payOn: '2026-10-21',
  status: 'confirmed',
  urgent: true,
  overdue: true,
  ...over,
});

const data: DashboardDto = {
  today: '2026-10-20',
  horizon: 15,
  totals: {
    pending: bucket(3, '1500.00', '100.00'),
    overdue: bucket(1, '1000.00'),
    upcoming: bucket(1, '500.00'),
    paidThisMonth: bucket(1, '200.00'),
  },
  inReview: 2,
  byPayDay: [
    { payOn: '2026-10-21', count: 2, amount: { MXN: '1500.00', USD: '100.00' } },
    { payOn: '2026-10-23', count: 1, amount: { MXN: '500.00', USD: '0.00' } },
  ],
  items: [
    item({}),
    item({
      id: 'p2',
      invoiceNumber: 'B-200',
      supplierName: 'Papelera Sur',
      total: '500.00',
      dueOn: '2026-10-24',
      payOn: '2026-10-23',
      urgent: false,
      overdue: false,
    }),
  ],
};

function setup(over: Partial<DashboardDto> = {}) {
  render(
    <MemoryRouter>
      <DashboardView data={{ ...data, ...over }} horizon={15} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('DashboardView', () => {
  it('AC-006-06 AC-010-03 la franja muestra cada moneda por separado y sin centavos', () => {
    setup();
    const strip = screen.getByLabelText('Resumen de la cartera');
    expect(within(strip).getByText('$1,500')).toBeInTheDocument();
    expect(within(strip).getByText('$100')).toBeInTheDocument();
    expect(within(strip).getByText('$500')).toBeInTheDocument();
    expect(strip).toHaveTextContent('$1,500MXN');
    expect(strip).toHaveTextContent('$100USD');
    expect(strip).not.toHaveTextContent(/1,600|\.00/);
  });

  it('AC-010-03 sin vencidos dice «Al corriente» en lugar de un cero en rojo', () => {
    setup({ totals: { ...data.totals, overdue: bucket(0, '0.00') } });
    const strip = screen.getByLabelText('Resumen de la cartera');
    expect(within(strip).getByText('Al corriente')).toBeInTheDocument();
    expect(strip).not.toHaveTextContent('$0');
  });

  it('AC-006-06 cambia de horizonte con pestañas', async () => {
    const onChange = vi.fn();
    render(<HorizonTabs value={15} onChange={onChange} />);
    expect(screen.getByRole('tab', { name: '15 días' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.setup().click(screen.getByRole('tab', { name: '30 días' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('AC-006-06 el título de próximos usa el horizonte que llegó del servidor', () => {
    setup({ horizon: 15 });
    expect(screen.getByText('Próximos 15 días')).toBeInTheDocument();
  });

  it('AC-006-02 AC-010-03 avisa cuántos están en revisión con «Revisar →» a la lista filtrada', () => {
    setup();
    expect(screen.getByText(/2 expedientes en revisión/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar →' })).toHaveAttribute(
      'href',
      '/expedientes?status=requires_review,pending_confirmation',
    );
  });

  it('AC-006-01 la tabla abre el detalle y marca vencido', () => {
    setup();
    expect(screen.getByRole('link', { name: 'A-100' })).toHaveAttribute('href', '/expedientes/p1');
    const table = screen.getByRole('table', { name: 'Expedientes del horizonte' });
    expect(within(table).getByText('Vencido')).toBeInTheDocument();
  });

  it('sin expedientes en el horizonte lo dice, y sin revisión no muestra el aviso', () => {
    setup({ items: [], inReview: 0, byPayDay: [] });
    expect(screen.getByText(/No hay expedientes por pagar/)).toBeInTheDocument();
    expect(screen.queryByText(/en revisión o por confirmar/)).not.toBeInTheDocument();
  });

  it('AC-009-03 AC-010-03 los días de pago dan total y expedientes en texto; un clic filtra la tabla', async () => {
    const user = setup();
    const days = screen.getByRole('list', { name: 'Próximos días de pago' });
    const first = within(days).getByRole('button', { name: /mié 21 oct/ });
    expect(first).toHaveTextContent('$1,500.00MXN');
    expect(first).toHaveTextContent('$100.00USD');
    expect(first).toHaveTextContent('2 expedientes');

    await user.click(within(days).getByRole('button', { name: /vie 23 oct/ }));
    const table = screen.getByRole('table', { name: 'Expedientes del horizonte' });
    expect(within(table).queryByText('A-100')).not.toBeInTheDocument();
    expect(within(table).getByText('B-200')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver todo el horizonte' }));
    expect(within(table).getByText('A-100')).toBeInTheDocument();
  });

  it('AC-009-03 AC-010-03 la cartera por vencimiento trae su tabla de texto con montos', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Cartera por vencimiento' });
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows).toEqual([
      'Vencido1$1,000.00MXN',
      '≤ 7 días1$500.00MXN',
      '8–15 días0—',
      'Después de 15 días1$100.00USD',
    ]);
  });

  it('AC-010-03 con un solo segmento lo dice en una frase', () => {
    setup({
      totals: { ...data.totals, pending: bucket(1, '500.00') },
      items: [data.items[1]!],
    });
    expect(screen.getByText('1 expediente, vence en los próximos 7 días.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Cartera por vencimiento' })).toBeNull();
  });

  it('AC-010-03 reparte lo por pagar sin mezclar monedas', () => {
    const buckets = dueBuckets(data);
    expect(buckets.map((b) => [b.key, b.count, b.amount.MXN, b.amount.USD])).toEqual([
      ['overdue', 1, '1000.00', '0.00'],
      ['week', 1, '500.00', '0.00'],
      ['horizon', 0, '0.00', '0.00'],
      ['later', 1, '0.00', '100.00'],
    ]);
  });

  it('AC-009-04 en el teléfono los expedientes del horizonte son tarjetas con su enlace', () => {
    setViewport(375);
    setup();
    expect(screen.queryByRole('table', { name: 'Expedientes del horizonte' })).toBeNull();
    const list = screen.getByRole('list', { name: 'Expedientes del horizonte' });
    expect(within(list).getByRole('link', { name: 'A-100' })).toHaveAttribute(
      'href',
      '/expedientes/p1',
    );
    expect(within(list).getByText('Vencido')).toBeInTheDocument();
  });
});

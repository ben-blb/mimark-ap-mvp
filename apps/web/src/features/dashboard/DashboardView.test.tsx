import type { DashboardDto } from '@mimark/contracts/dashboard';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { DashboardView } from './DashboardView';

const bucket = (count: number, MXN: string, USD = '0.00') => ({ count, amount: { MXN, USD } });

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
  byPayDay: [{ payOn: '2026-10-21', count: 2, amount: { MXN: '1500.00', USD: '100.00' } }],
  items: [
    {
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
    },
  ],
};

function setup(over: Partial<DashboardDto> = {}) {
  const onHorizonChange = vi.fn();
  render(
    <MemoryRouter>
      <DashboardView data={{ ...data, ...over }} horizon={15} onHorizonChange={onHorizonChange} />
    </MemoryRouter>,
  );
  return { onHorizonChange, user: userEvent.setup() };
}

describe('DashboardView', () => {
  it('AC-006-06 muestra cada importe con su moneda, sin mezclar MXN y USD', () => {
    setup();
    expect(screen.getByText('$1,500.00 MXN', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('$100.00 USD', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('$1,000.00 MXN', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText(/1,600/)).not.toBeInTheDocument();
  });

  it('AC-006-06 cambia de horizonte desde el selector, sin recargar la página', async () => {
    const { onHorizonChange, user } = setup();
    expect(screen.getByRole('button', { name: '15 días' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '30 días' }));
    expect(onHorizonChange).toHaveBeenCalledWith(30);
  });

  it('AC-006-06 el título de próximos usa el horizonte que llegó del servidor', () => {
    setup({ horizon: 15 });
    expect(screen.getByText('Próximos 15 días')).toBeInTheDocument();
  });

  it('AC-006-02 avisa cuántos están en revisión y enlaza a la lista filtrada', () => {
    setup();
    const link = screen.getByRole('link', { name: 'Ver expedientes' });
    expect(screen.getByText(/2 expedientes en revisión/)).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      '/expedientes?status=requires_review,pending_confirmation',
    );
  });

  it('AC-006-01 la tabla abre el detalle y marca urgente y vencido', () => {
    setup();
    expect(screen.getByRole('link', { name: 'A-100' })).toHaveAttribute('href', '/expedientes/p1');
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  it('sin expedientes en el horizonte lo dice, y sin revisión no muestra el aviso', () => {
    setup({ items: [], inReview: 0, byPayDay: [] });
    expect(screen.getByText(/No hay expedientes por pagar/)).toBeInTheDocument();
    expect(screen.queryByText(/en revisión o por confirmar/)).not.toBeInTheDocument();
  });

  it('AC-009-03 la gráfica por día de pago trae su tabla en texto, una columna por moneda', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Importe por día de pago' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Día de pago', 'Expedientes', 'MXN', 'USD']);
    expect(within(table).getByText('$1,500.00 MXN')).toBeInTheDocument();
    expect(within(table).getByText('$100.00 USD')).toBeInTheDocument();
  });

  it('AC-009-03 la dona reparte lo por pagar en vencidos, dentro del horizonte y después', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Expedientes por pagar según vencimiento' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(rows).toEqual(['Vencidos1', 'Dentro de 15 días1', 'Después1']);
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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { PurchaseOrderForm } from './PurchaseOrderForm';

const suppliers = [
  { id: 's1', name: 'Distribuidora del Norte', creditDays: 15, currency: 'MXN' },
  { id: 's2', name: 'Importadora Snacks', creditDays: 20, currency: 'USD' },
] as const;

function setup(error: unknown = null) {
  const onSubmit = vi.fn();
  render(
    <PurchaseOrderForm
      suppliers={[...suppliers]}
      today="2026-10-20"
      pending={false}
      error={error}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('PurchaseOrderForm', () => {
  it('AC-003-08 propone la moneda del proveedor elegido', async () => {
    const { user } = setup();
    const currency = screen.getByLabelText('Moneda');
    expect(currency).toHaveValue('MXN');

    await user.selectOptions(screen.getByLabelText('Proveedor'), 's2');
    expect(currency).toHaveValue('USD');
  });

  it('AC-003-08 valida folio, total y proveedor antes de enviar', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Total con impuestos'), '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Escribe el folio')).toBeInTheDocument();
    expect(screen.getByText('El total debe ser mayor a 0')).toBeInTheDocument();
    expect(screen.getByText('Elige un proveedor')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-003-08 envía el folio normalizado y la fecha de hoy por defecto', async () => {
    const { onSubmit, user } = setup();
    await user.selectOptions(screen.getByLabelText('Proveedor'), 's1');
    await user.type(screen.getByLabelText('Folio'), ' oc-2001 ');
    await user.type(screen.getByLabelText('Total con impuestos'), '5800.00');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 'OC-2001',
        supplierId: 's1',
        issuedOn: '2026-10-20',
        total: '5800.00',
        currency: 'MXN',
      }),
    );
  });

  it('AC-003-08 muestra en su campo el error de la API (folio repetido)', () => {
    setup(
      new ApiError(409, 'CONFLICT', 'Ya existe una OC con ese folio.', 'req-1', {
        number: 'Ya existe una OC con ese folio',
      }),
    );
    expect(screen.getByText('Ya existe una OC con ese folio')).toBeInTheDocument();
  });
});

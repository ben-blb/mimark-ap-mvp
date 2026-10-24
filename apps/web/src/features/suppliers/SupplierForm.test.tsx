import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { SupplierForm } from './SupplierForm';

function setup(error: unknown = null) {
  const onSubmit = vi.fn();
  render(<SupplierForm pending={false} error={error} onSubmit={onSubmit} onCancel={vi.fn()} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('SupplierForm', () => {
  it('AC-002-07 muestra el error de cada campo antes de enviar', async () => {
    const { onSubmit, user } = setup();

    await user.type(screen.getByLabelText('Razón social'), 'Distribuidora del Norte');
    await user.type(screen.getByLabelText('RFC'), 'no-es-rfc');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(/RFC inválido/)).toBeInTheDocument();
    expect(screen.getByText(/Escribe los días de crédito/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-002-07 envía los datos ya normalizados por el esquema', async () => {
    const { onSubmit, user } = setup();

    await user.type(screen.getByLabelText('Razón social'), 'Distribuidora del Norte');
    await user.type(screen.getByLabelText('RFC'), 'dan010203ab1');
    await user.type(screen.getByLabelText('Días de crédito'), '15');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Distribuidora del Norte',
      taxId: 'DAN010203AB1',
      creditDays: 15,
      currency: 'MXN',
      active: true,
    });
  });

  it('AC-002-07 muestra en su campo el error que devolvió la API (RFC repetido)', () => {
    setup(
      new ApiError(409, 'CONFLICT', 'Ya existe un proveedor con ese RFC.', 'req-1', {
        taxId: 'Ya existe un proveedor con ese RFC',
      }),
    );
    expect(screen.getByText('Ya existe un proveedor con ese RFC')).toBeInTheDocument();
  });
});

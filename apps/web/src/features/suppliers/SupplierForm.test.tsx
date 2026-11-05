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

describe('SupplierForm · nombre en ParLevel (spec 015)', () => {
  it('AC-015-06 abre prellenado con lo que dice el PDF y envía el alias', async () => {
    const onSubmit = vi.fn();
    render(
      <SupplierForm
        initial={{ name: 'Refrescos del Norte', parlevelName: 'Refrescos del Norte' }}
        pending={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByLabelText('Razón social')).toHaveValue('Refrescos del Norte');
    expect(screen.getByLabelText('Nombre en ParLevel (opcional)')).toHaveValue(
      'Refrescos del Norte',
    );

    await user.type(screen.getByLabelText('RFC'), 'rdn010101ab1');
    await user.type(screen.getByLabelText('Días de crédito'), '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Refrescos del Norte',
      parlevelName: 'Refrescos del Norte',
      taxId: 'RDN010101AB1',
      creditDays: 30,
      currency: 'MXN',
      active: true,
    });
  });
});

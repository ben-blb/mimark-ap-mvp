import type { PayableDto } from '@mimark/contracts/payables';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { CorrectFieldsForm } from './CorrectFieldsForm';

const payable = {
  isApDocument: true,
  uncertainFields: ['supplierTaxId'],
  fields: {
    docType: 'factura',
    supplierName: 'Bebidas Frías',
    supplierTaxId: 'BFM980512KL3',
    invoiceNumber: 'A-1',
    issueDate: '2026-10-06',
    poNumber: null,
    subtotal: '7200.00',
    taxes: '1152.00',
    total: '8352.00',
    currency: 'MXN',
    taxUuid: null,
  },
} as unknown as PayableDto;

function setup(over: Partial<PayableDto> = {}, error: unknown = null) {
  const onSubmit = vi.fn();
  render(
    <CorrectFieldsForm
      payable={{ ...payable, ...over }}
      pending={false}
      error={error}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('CorrectFieldsForm', () => {
  it('AC-005-01 envía solo lo que cambió, más los campos dudosos', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Orden de compra'), 'oc-1002');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith({ poNumber: 'oc-1002', supplierTaxId: 'BFM980512KL3' });
  });

  it('AC-005-01 dejar un campo vacío lo envía como null', async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText('Factura'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: null }));
  });

  it('AC-005-01 valida con el esquema de la API antes de enviar', async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText('Total'));
    await user.type(screen.getByLabelText('Total'), '12,5x');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(/Importe inválido/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-005-03 un fuera de alcance ofrece reclasificar y lo envía como isApDocument', async () => {
    const { onSubmit, user } = setup({ isApDocument: false, uncertainFields: [] });
    expect(screen.getByLabelText('Reclasificar como documento de compra')).toBeChecked();
    await user.type(screen.getByLabelText('Factura'), '7');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ isApDocument: true, invoiceNumber: 'A-17' }),
    );
  });

  it('AC-005-01 muestra en su campo el error que devuelve la API', () => {
    setup(
      {},
      new ApiError(400, 'VALIDATION', 'Revisa los datos marcados.', 'req-1', {
        issueDate: 'Fecha inválida',
      }),
    );
    expect(screen.getByText('Fecha inválida')).toBeInTheDocument();
  });
});

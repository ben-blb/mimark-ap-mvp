import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadForm } from './UploadForm';

function setup(props: { pending?: boolean } = {}) {
  const onSubmit = vi.fn();
  render(
    <UploadForm
      orders={[{ id: 'o1', number: 'OC-1001', supplierName: 'Distribuidora del Norte' }]}
      today="2026-10-20"
      pending={props.pending ?? false}
      error={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  // El atributo accept solo es una ayuda del navegador; la validación real es la nuestra.
  return { onSubmit, user: userEvent.setup({ applyAccept: false }) };
}

const pdf = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });

describe('UploadForm', () => {
  it('AC-004-15 rechaza un archivo que no es PDF, PNG o JPG sin enviarlo', async () => {
    const { onSubmit, user } = setup();
    await user.upload(
      screen.getByLabelText('Archivo'),
      new File(['x'], 'macro.docx', { type: 'application/msword' }),
    );

    expect(screen.getByText('Solo se aceptan archivos PDF, PNG o JPG.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-004-15 rechaza un archivo de más de 4 MB sin enviarlo', async () => {
    const { onSubmit, user } = setup();
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'grande.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText('Archivo'), big);

    expect(
      screen.getByText('El archivo pesa más de 4 MB. Comprímelo o súbelo en otra resolución.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-004-15 envía el archivo válido con la OC elegida y la fecha de hoy por defecto', async () => {
    const { onSubmit, user } = setup();
    await user.upload(screen.getByLabelText('Archivo'), pdf);
    await user.selectOptions(screen.getByLabelText('Orden de compra (opcional)'), 'OC-1001');
    await user.click(screen.getByRole('button', { name: 'Subir' }));

    expect(onSubmit).toHaveBeenCalledWith({
      file: pdf,
      purchaseOrderNumber: 'OC-1001',
      invoiceReceivedOn: '2026-10-20',
    });
  });

  it('AC-004-15 mientras procesa avisa que está leyendo el documento', () => {
    setup({ pending: true });
    expect(screen.getByText('Leyendo el documento…')).toBeInTheDocument();
  });
});

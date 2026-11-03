import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import type { PurchaseOrderDraft } from '@mimark/contracts/purchase-orders';
import { PurchaseOrderForm } from './PurchaseOrderForm';

const suppliers = [
  { id: 's1', name: 'Distribuidora del Norte', creditDays: 15, currency: 'MXN' },
  { id: 's2', name: 'Importadora Snacks', creditDays: 20, currency: 'USD' },
] as const;

function setup(error: unknown = null, draft?: PurchaseOrderDraft) {
  const onSubmit = vi.fn();
  render(
    <PurchaseOrderForm
      suppliers={[...suppliers]}
      today="2026-10-20"
      draft={draft}
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
    await user.type(screen.getByLabelText('Descripción'), 'Vasos');
    await user.type(screen.getByLabelText('Precio unitario'), '100');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 'OC-2001',
        supplierId: 's1',
        issuedOn: '2026-10-20',
        total: '5800.00',
        currency: 'MXN',
        lines: [{ sku: '', description: 'Vasos', quantity: '1', unit: 'pza', unitPrice: '100' }],
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

const draft: PurchaseOrderDraft = {
  number: 'OC-3001',
  supplierName: 'Distribuidora del Norte',
  supplierTaxId: 'DAN010203AB1',
  supplier: {
    id: 's1',
    name: 'Distribuidora del Norte',
    taxId: 'DAN010203AB1',
    creditDays: 15,
    currency: 'MXN',
  },
  issuedOn: '2026-10-19',
  currency: 'MXN',
  parlevelRef: 'PL-42',
  lines: [
    {
      sku: 'CAF-1',
      description: 'Café 1 kg',
      quantity: '20',
      unit: 'bolsa',
      unitPrice: '100',
      statedAmount: '2000.00',
    },
    {
      sku: null,
      description: 'Filtros',
      quantity: '10',
      unit: 'caja',
      unitPrice: '50',
      statedAmount: '500.00',
    },
  ],
  subtotal: '2500.00',
  taxes: '400.00',
  total: '2900.00',
  uncertainFields: [],
  warnings: [],
};

describe('PurchaseOrderForm · borrador del PDF', () => {
  it('AC-014-12 abre prellenado con el folio, el total y las partidas leídas', () => {
    setup(null, draft);
    expect(screen.getByLabelText('Folio')).toHaveValue('OC-3001');
    expect(screen.getByLabelText('Total con impuestos')).toHaveValue('2900.00');
    expect(
      screen.getAllByLabelText('Descripción').map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Café 1 kg', 'Filtros']);
    expect(screen.getByLabelText('Importe de la partida 1')).toHaveTextContent('$2,000.00');
    expect(screen.getByText(/Impuestos \(total − partidas\): \$400\.00/)).toBeInTheDocument();
  });

  it('AC-014-12 permite editar, agregar y quitar partidas', async () => {
    const { onSubmit, user } = setup(null, draft);
    await user.clear(screen.getAllByLabelText('Cantidad')[0]!);
    await user.type(screen.getAllByLabelText('Cantidad')[0]!, '10');
    await user.click(screen.getByRole('button', { name: 'Quitar partida 2' }));
    expect(screen.getAllByLabelText('Descripción')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Agregar partida' }));
    expect(screen.getAllByLabelText('Descripción')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Quitar partida 2' }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          {
            sku: 'CAF-1',
            description: 'Café 1 kg',
            quantity: '10',
            unit: 'bolsa',
            unitPrice: '100',
          },
        ],
      }),
    );
  });

  it('AC-014-12 con avisos no se guarda hasta marcar que se revisó contra el PDF', async () => {
    const { onSubmit, user } = setup(null, {
      ...draft,
      warnings: [
        { field: 'subtotal', message: 'La suma de las partidas no coincide con el subtotal' },
      ],
    });
    expect(
      screen.getByText('La suma de las partidas no coincide con el subtotal'),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText('Revisé las partidas contra el PDF'));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('AC-014-12 un campo obligatorio vacío sigue bloqueando el guardado', async () => {
    const { onSubmit, user } = setup(null, {
      ...draft,
      lines: [{ ...draft.lines[0]!, quantity: null }],
    });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Cantidad inválida/)).toBeInTheDocument();
  });

  it('AC-014-12 marca como dudosos los campos que la IA leyó con dudas', () => {
    setup(null, { ...draft, uncertainFields: ['total'] });
    expect(screen.getByText('Verifícalo contra el PDF')).toBeInTheDocument();
  });

  it('AC-014-13 deja elegido el proveedor que coincide por RFC y toma la moneda del PDF', () => {
    setup(null, { ...draft, currency: 'USD' });
    expect(screen.getByLabelText('Proveedor')).toHaveValue('s1');
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
  });

  it('AC-014-13 sin coincidencia exige elegir el proveedor antes de guardar', async () => {
    const { onSubmit, user } = setup(null, { ...draft, supplier: null });
    expect(screen.getByLabelText('Proveedor')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Elige un proveedor')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

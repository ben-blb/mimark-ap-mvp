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

function setup(
  error: unknown = null,
  draft?: PurchaseOrderDraft,
  extra: Partial<Parameters<typeof PurchaseOrderForm>[0]> = {},
) {
  const onSubmit = vi.fn();
  render(
    <PurchaseOrderForm
      suppliers={[...suppliers]}
      today="2026-10-20"
      draft={draft}
      {...extra}
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
  supplierMatch: 'taxId',
  supplierSuggestion: null,
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
      deposit: null,
      receivedQuantity: null,
    },
    {
      sku: null,
      description: 'Filtros',
      quantity: '10',
      unit: 'caja',
      unitPrice: '50',
      statedAmount: '500.00',
      deposit: null,
      receivedQuantity: null,
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

describe('PurchaseOrderForm · PDF de ParLevel (spec 015)', () => {
  const parlevel: PurchaseOrderDraft = {
    ...draft,
    number: 'P3062',
    supplier: null,
    supplierMatch: null,
    supplierSuggestion: { name: 'Refrescos del Norte', city: 'Monterrey, Nuevo Leon 64890' },
    currency: null,
    subtotal: '2500.00',
    taxes: null,
    total: null,
    warnings: [
      {
        field: 'total',
        message:
          'El PDF de ParLevel no trae impuestos: captura el total de la cotización o la factura',
      },
    ],
  };

  it('AC-015-04 AC-015-06 muestra lo que dice el PDF del proveedor y ofrece registrarlo', async () => {
    const onRegisterSupplier = vi.fn();
    const { user } = setup(null, parlevel, { onRegisterSupplier });
    expect(screen.getByLabelText('Proveedor del PDF')).toHaveTextContent(
      'El PDF dice: Refrescos del Norte · Monterrey, Nuevo Leon 64890',
    );
    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }));
    expect(onRegisterSupplier).toHaveBeenCalledWith(parlevel.supplierSuggestion);
  });

  it('AC-015-03 dice cómo se reconoció al proveedor', () => {
    setup(null, { ...draft, supplierMatch: 'alias' });
    expect(screen.getByText('Reconocido por su nombre en ParLevel')).toBeInTheDocument();
  });

  it('AC-015-07 sin total exige capturarlo; «Subtotal + IVA 16 %» lo propone y se puede cambiar', async () => {
    const { onSubmit, user } = setup(null, { ...parlevel, supplier: draft.supplier });
    expect(screen.getByLabelText('Total con impuestos')).toHaveValue('');
    expect(screen.getByText(/no trae impuestos/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Revisé las partidas contra el PDF'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Subtotal + IVA 16 %' }));
    expect(screen.getByLabelText('Total con impuestos')).toHaveValue('2900.00');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ total: '2900.00' }));
  });

  it('AC-015-08 sin moneda en el PDF usa la del proveedor y la marca para revisar', () => {
    setup(null, {
      ...parlevel,
      supplier: { ...draft.supplier!, currency: 'USD' },
      uncertainFields: ['currency'],
    });
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
    expect(screen.getByText('Verifícalo contra el PDF')).toBeInTheDocument();
  });

  it('AC-015-06 un proveedor recién registrado queda elegido con su moneda', () => {
    const onSubmit = vi.fn();
    const props = {
      suppliers: [...suppliers],
      today: '2026-10-20',
      draft: parlevel,
      pending: false,
      error: null,
      onSubmit,
      onCancel: vi.fn(),
    };
    const { rerender } = render(<PurchaseOrderForm {...props} />);
    expect(screen.getByLabelText('Proveedor')).toHaveValue('');
    rerender(<PurchaseOrderForm {...props} registeredSupplierId="s2" />);
    expect(screen.getByLabelText('Proveedor')).toHaveValue('s2');
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
    expect(screen.queryByLabelText('Proveedor del PDF')).not.toBeInTheDocument();
  });
});

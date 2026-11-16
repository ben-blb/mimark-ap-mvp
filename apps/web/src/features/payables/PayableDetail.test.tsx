import type { PayableDto } from '@mimark/contracts/payables';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PayableDetail } from './PayableDetail';

const hostile = '<img src=x onerror="alert(1)"><b>negrita</b>';

const payable: PayableDto = {
  id: 'p1',
  status: 'requires_review',
  createdBy: 'Ana',
  createdAt: '2026-10-20T15:00:00.000Z',
  updatedAt: '2026-10-20T15:00:00.000Z',
  file: { name: 'factura.pdf', mimeType: 'application/pdf', size: 100 },
  invoiceReceivedOn: '2026-10-20',
  selectedPoNumber: null,
  isApDocument: true,
  fields: {
    docType: 'factura',
    supplierName: hostile,
    supplierTaxId: 'DAN010203AB1',
    invoiceNumber: 'A-1',
    issueDate: '2026-10-06',
    poNumber: null,
    subtotal: '7200.00',
    taxes: '1152.00',
    total: '8532.00',
    currency: 'MXN',
    taxUuid: null,
  },
  uncertainFields: ['supplierTaxId'],
  reviewReasons: [
    { code: 'TOTAL_MISMATCH' },
    { code: 'MISSING_FIELD', field: 'purchaseOrderNumber' },
  ],
  evidence: [{ field: 'supplierName', text: hostile, page: 1 }],
  failureCode: null,
  purchaseOrder: null,
  supplier: null,
  extraction: { model: 'fake', promptVersion: 'fake', ms: 1500 },
  schedule: null,
  payment: null,
  documents: null,
  discardReason: null,
  allowedActions: [],
};

function setup(over: Partial<PayableDto> = {}, actions?: React.ReactNode) {
  const { container } = render(
    <PayableDetail
      payable={{ ...payable, ...over }}
      actions={actions}
      history={[
        {
          at: '2026-10-20T15:00:00.000Z',
          actor: 'Ana',
          action: 'payable.uploaded',
          fromStatus: null,
          toStatus: 'uploaded',
          data: null,
        },
        {
          at: '2026-10-20T15:00:02.000Z',
          actor: 'sistema',
          action: 'payable.extracted',
          fromStatus: 'processing',
          toStatus: 'requires_review',
          data: null,
        },
      ]}
    />,
  );
  return { container };
}

describe('PayableDetail', () => {
  it('AC-004-16 muestra campos y evidencia del documento como texto, nunca como HTML', () => {
    const { container } = setup();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(hostile)).toBeInTheDocument(); // valor
    expect(screen.getByText(`${hostile} (pág. 1)`)).toBeInTheDocument(); // evidencia
  });

  it('AC-004-16 muestra cada razón con su etiqueta en español', () => {
    setup();
    expect(screen.getByText('El total no coincide con la OC')).toBeInTheDocument();
    expect(screen.getByText(/Falta un dato obligatorio \(Orden de compra\)/)).toBeInTheDocument();
    expect(screen.queryByText('TOTAL_MISMATCH')).not.toBeInTheDocument();
  });

  it('AC-004-16 marca lo que falta y lo dudoso', () => {
    setup();
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
    expect(screen.getByText('Dudoso')).toBeInTheDocument();
  });

  it('AC-004-11 el original se muestra en un iframe titulado que apunta a la API', () => {
    setup();
    expect(screen.getByTitle('Documento original')).toHaveAttribute('src', '/api/payables/p1/file');
  });

  it('AC-005-07 la tarjeta de pago muestra vencimiento, urgente y vencido', () => {
    setup({
      status: 'confirmed',
      schedule: {
        dueOn: '2026-10-08',
        suggestedPayOn: '2026-10-21',
        scheduledPayOn: null,
        urgent: true,
        overdue: true,
      },
      documents: { invoice: 'received', complement: 'pending' },
    });
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText(/Programado: sin programar/)).toBeInTheDocument();
    expect(screen.getByText('Complemento: pendiente')).toBeInTheDocument();
  });

  it('muestra la barra de acciones que le pasan, y ningún botón si no le pasan nada', () => {
    const { container } = setup();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    container.remove();
  });

  it('AC-009-05 marca lo dudoso y lo faltante con texto, no solo con color', () => {
    setup();
    const fields = screen.getByLabelText('Campos extraídos');
    const taxId = within(fields).getByText('RFC del proveedor').parentElement as HTMLElement;
    expect(within(taxId).getByText('Dudoso')).toBeInTheDocument();
    const po = within(fields).getByText('Orden de compra').parentElement as HTMLElement;
    expect(within(po).getByText('Falta')).toBeInTheDocument();
  });

  it('AC-009-05 el historial es una línea de tiempo en orden', () => {
    setup();
    const items = screen.getAllByRole('listitem').filter((li) => li.closest('ol'));
    expect(items.map((li) => li.firstChild?.textContent)).toEqual([
      'Documento subido',
      'Lectura con IA',
    ]);
  });

  it('AC-009-05 dibuja la barra de acciones que le pasan', () => {
    setup({}, <button type="button">Corregir</button>);
    expect(screen.getByRole('button', { name: 'Corregir' })).toBeInTheDocument();
  });

  describe('cuadro Pedido / Recibido / Facturado (spec 019)', () => {
    const order = (over: Partial<NonNullable<PayableDto['purchaseOrder']>> = {}) => ({
      id: 'o1',
      number: 'OC-3062',
      total: '35815.58',
      currency: 'MXN' as const,
      receiptStatus: 'received_with_differences' as const,
      linesSubtotal: '30875.50',
      receivedSubtotal: '30128.00',
      receivedOn: '2026-10-10',
      receiptNotes: '<b>Faltaron 5 cajas</b>',
      ...over,
    });
    const table = () => screen.getByRole('region', { name: 'Pedido, recibido y facturado' });

    it('AC-019-16 muestra pedido, recibido y facturado, y marca el subtotal que no cuadra', () => {
      setup({
        purchaseOrder: order(),
        fields: { ...payable.fields, subtotal: '30875.50', total: '35815.58' },
        reviewReasons: [{ code: 'RECEIVED_AMOUNT_MISMATCH' }],
      });
      const view = within(table());
      expect(view.getByText('Pedido (subtotal)').parentElement).toHaveTextContent('30,875.50');
      expect(view.getByText('Recibido (subtotal)').parentElement).toHaveTextContent('30,128.00');
      const billed = view.getByText('Facturado (subtotal)').parentElement!;
      expect(billed).toHaveTextContent('30,875.50');
      expect(billed).toHaveTextContent('No coincide con lo recibido');
      expect(view.getByText('Total de la orden').parentElement).toHaveTextContent('35,815.58');
      expect(view.getByText('Total de la factura').parentElement).toHaveTextContent('35,815.58');
    });

    it('AC-019-16 si el subtotal facturado cuadra con lo recibido, nada se marca', () => {
      setup({
        purchaseOrder: order(),
        fields: { ...payable.fields, subtotal: '30128.00', total: '34948.48' },
        reviewReasons: [],
      });
      expect(within(table()).queryByText(/No coincide/)).toBeNull();
    });

    it('AC-019-16 sin diferencias se marca el total de la factura si no es el de la orden', () => {
      setup({
        purchaseOrder: order({ receiptStatus: 'received', receivedSubtotal: '30875.50' }),
        fields: { ...payable.fields, subtotal: '30875.50', total: '35815.59' },
      });
      expect(within(table()).getByText('No coincide con la orden')).toBeInTheDocument();
    });

    it('AC-019-16 las notas de recepción se muestran como texto, no como HTML', () => {
      const { container } = setup({ purchaseOrder: order() });
      expect(within(table()).getByText(/Faltaron 5 cajas/)).toBeInTheDocument();
      expect(container.querySelector('region b, section b')).toBeNull();
    });

    it('AC-019-17 la razón se explica con los dos importes', () => {
      setup({
        purchaseOrder: order(),
        fields: { ...payable.fields, subtotal: '30875.50' },
        reviewReasons: [{ code: 'RECEIVED_AMOUNT_MISMATCH' }],
      });
      expect(
        screen.getByText(
          'El subtotal de la factura ($30,875.50) no coincide con lo que recibió Almacén ($30,128.00).',
        ),
      ).toBeInTheDocument();
    });
  });
});

import type { PayableDto } from '@mimark/contracts/payables';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

function setup(over: Partial<PayableDto> = {}) {
  const onRetry = vi.fn();
  const { container } = render(
    <PayableDetail
      payable={{ ...payable, ...over }}
      history={[
        {
          at: '2026-10-20T15:00:00.000Z',
          actor: 'Ana',
          action: 'payable.uploaded',
          fromStatus: null,
          toStatus: 'uploaded',
          data: null,
        },
      ]}
      onRetry={onRetry}
    />,
  );
  return { container, onRetry };
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

  it('solo muestra «Reintentar» si la API lo permite', () => {
    const { container } = setup();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    container.remove();
    setup({ status: 'failed', allowedActions: ['retry'] });
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

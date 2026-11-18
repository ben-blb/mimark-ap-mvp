import type { UploadPreviewDto } from '@mimark/contracts/closing-uploads';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { UploadPreview } from './UploadPreview';

const preview: UploadPreviewDto = {
  upload: {
    id: 'u1',
    companyId: 'co1',
    month: '2026-09',
    source: 'parlevel_sales',
    accountId: null,
    fileName: 'ventas.xlsx',
    status: 'previewed',
    uploadedBy: 'Ana',
    rowsRead: 5,
    rowsRejected: 1,
    entriesCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  rowsRead: 5,
  rowsRejected: 1,
  rowsUnknownKiosk: 1,
  total: '1250.50',
  rejected: [{ row: 6, reason: 'Fecha inválida' }],
  sample: [
    { row: 2, date: '2026-09-01', kioskId: 'k1', concept: 'Ventas', amount: '1000.00', flags: [] },
    {
      row: 3,
      date: '2026-09-02',
      kioskId: null,
      concept: '=CMD()',
      amount: '250.50',
      flags: ['UNKNOWN_KIOSK:ZZ-9'],
    },
    {
      row: 4,
      date: '2026-09-03',
      kioskId: null,
      concept: '<img src=x onerror=alert(1)>',
      amount: '-10.00',
      flags: [],
    },
  ],
};

function setup() {
  setViewport(1440);
  const onConfirm = vi.fn();
  const onDiscard = vi.fn();
  render(
    <MemoryRouter>
      <UploadPreview
        preview={preview}
        kioskNames={{ k1: 'Kiosko Plaza' }}
        pending={false}
        error={null}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
      />
    </MemoryRouter>,
  );
  return { onConfirm, onDiscard, user: userEvent.setup() };
}

describe('UploadPreview (spec 021)', () => {
  it('AC-021-01 muestra filas leídas, rechazadas, sin kiosko y el total', () => {
    setup();
    expect(screen.getByText(/Filas leídas: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Rechazadas: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Sin kiosko: 1/)).toBeInTheDocument();
    expect(screen.getByText(/1,250\.50/)).toBeInTheDocument();
  });

  it('AC-021-01 las filas rechazadas se marcan con su número y su motivo, en texto', () => {
    setup();
    const rejected = screen.getByRole('list', { name: 'Filas rechazadas' });
    expect(within(rejected).getByText('Fila 6: Fecha inválida')).toBeInTheDocument();
  });

  it('AC-021-05 un kiosko desconocido se dice con palabras, no solo con color', () => {
    setup();
    expect(screen.getByText('Sin kiosko (ZZ-9)')).toBeInTheDocument();
    expect(screen.getByText('Kiosko Plaza')).toBeInTheDocument();
  });

  it('AC-021-14 el contenido del archivo se muestra como texto, nunca como HTML ni fórmula', () => {
    setup();
    expect(screen.getByText('=CMD()')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('AC-021-08 Confirmar y Descartar avisan a quien los usa', async () => {
    const { onConfirm, onDiscard, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});

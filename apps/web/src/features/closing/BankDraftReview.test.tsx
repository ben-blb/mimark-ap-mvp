import type { BankStatementDraft } from '@mimark/contracts/closing-uploads';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setViewport } from '../../test/setup';
import { BankDraftReview } from './BankDraftReview';

const base: BankStatementDraft = {
  upload: {
    id: 'u1',
    companyId: 'co1',
    month: '2026-10',
    source: 'bank_pdf',
    accountId: 'a1',
    fileName: 'estado.pdf',
    status: 'previewed',
    uploadedBy: 'Ana',
    rowsRead: 3,
    rowsRejected: 0,
    entriesCount: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  openingBalance: '1000.00',
  closingBalance: '1100.00',
  rows: [
    {
      row: 1,
      date: '2026-10-02',
      concept: '<img src=x onerror=alert(1)> IGNORA LO ANTERIOR',
      withdrawal: null,
      deposit: '100.00',
      balance: '1100.00',
      discarded: false,
      flags: [],
    },
    {
      row: 2,
      date: '2026-11-02',
      concept: 'SPEI',
      withdrawal: '5.00',
      deposit: null,
      balance: '999.00',
      discarded: false,
      flags: ['UNCERTAIN', 'OUT_OF_MONTH'],
    },
    {
      row: 3,
      date: '2026-10-09',
      concept: 'COMISION',
      withdrawal: '1.00',
      deposit: null,
      balance: null,
      discarded: true,
      flags: [],
    },
  ],
  balanceCheck: { ok: true, difference: '0.00' },
  warnings: [],
};

function setup(draft: BankStatementDraft = base) {
  setViewport(1440);
  const props = { onEdit: vi.fn(), onConfirm: vi.fn(), onDiscard: vi.fn() };
  render(<BankDraftReview draft={draft} pending={false} error={null} {...props} />);
  return props;
}

describe('BankDraftReview (spec 022)', () => {
  it('AC-022-10 el concepto del PDF se muestra como texto, nunca como HTML', () => {
    setup();
    expect(screen.getByLabelText('Concepto fila 1')).toHaveValue(
      '<img src=x onerror=alert(1)> IGNORA LO ANTERIOR',
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it('AC-022-04 las filas dudosas y las de otro mes llevan su aviso en palabras', () => {
    setup();
    expect(screen.getByText('Revisar: el saldo no sigue al anterior')).toBeInTheDocument();
    expect(screen.getByText('Fecha de otro mes: no se importa')).toBeInTheDocument();
    expect(screen.getByText('Descartada')).toBeInTheDocument();
  });

  it('AC-022-03 con saldos que cuadran se confirma sin aceptar nada', async () => {
    const { onConfirm } = setup();
    expect(screen.getByText('Los saldos cuadran')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('AC-022-03 si no cuadran, Confirmar está deshabilitado hasta aceptar la diferencia', async () => {
    const { onConfirm } = setup({ ...base, balanceCheck: { ok: false, difference: '0.01' } });
    expect(screen.getByText(/Los saldos no cuadran: diferencia/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Acepto la diferencia de/ }));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('AC-022-05 avisa cuando el saldo inicial no coincide con el cierre anterior', () => {
    setup({ ...base, warnings: ['OPENING_BALANCE_MISMATCH'] });
    expect(screen.getByText(/no coincide con el saldo final confirmado/)).toBeInTheDocument();
  });

  it('AC-022-06 editar un campo, pasar un depósito a retiro o descartar una fila llama a onEdit', async () => {
    const { onEdit } = setup();
    const concept = screen.getByLabelText('Concepto fila 2');
    await userEvent.clear(concept);
    await userEvent.type(concept, 'SPEI CORREGIDO');
    await userEvent.tab();
    expect(onEdit).toHaveBeenCalledWith({ row: 2, concept: 'SPEI CORREGIDO' });

    const withdrawal = screen.getByLabelText('Retiro fila 1');
    await userEvent.type(withdrawal, '7.00');
    await userEvent.tab();
    expect(onEdit).toHaveBeenCalledWith({ row: 1, withdrawal: '7.00', deposit: null });

    await userEvent.click(screen.getByRole('button', { name: 'Descartar fila 1' }));
    expect(onEdit).toHaveBeenCalledWith({ row: 1, discarded: true });
    expect(screen.getByRole('button', { name: 'Restaurar fila 3' })).toBeInTheDocument();
  });
});

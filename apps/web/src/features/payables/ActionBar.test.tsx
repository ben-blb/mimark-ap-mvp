import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar, type PayableAction } from './ActionBar';

/** allowedActions por estado, tal como los entrega la API (spec 005). */
const BY_STATUS: Record<string, { actions: PayableAction[]; buttons: string[] }> = {
  failed: { actions: ['retry', 'discard'], buttons: ['Reintentar', 'Descartar'] },
  requires_review: { actions: ['correct', 'discard'], buttons: ['Corregir', 'Descartar'] },
  pending_confirmation: {
    actions: ['correct', 'confirm', 'discard'],
    buttons: ['Corregir', 'Confirmar', 'Descartar'],
  },
  out_of_scope: { actions: ['correct', 'discard'], buttons: ['Corregir', 'Descartar'] },
  confirmed: { actions: ['schedule', 'documents'], buttons: ['Programar pago', 'Documentos'] },
  scheduled: {
    actions: ['schedule', 'pay', 'documents'],
    buttons: ['Programar pago', 'Registrar pago', 'Documentos'],
  },
  paid: { actions: ['documents'], buttons: ['Documentos'] },
  discarded: { actions: [], buttons: [] },
};

describe('ActionBar', () => {
  it.each(Object.entries(BY_STATUS))(
    'AC-005-14 en %s muestra exactamente las acciones de allowedActions',
    (_status, { actions, buttons }) => {
      render(<ActionBar actions={actions} onAction={vi.fn()} />);
      expect(screen.queryAllByRole('button').map((b) => b.textContent)).toEqual(buttons);
    },
  );

  it('AC-005-14 no inventa acciones: sin allowedActions no hay botones', () => {
    render(<ActionBar actions={[]} onAction={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('AC-005-14 avisa qué acción eligió la persona', async () => {
    const onAction = vi.fn();
    render(<ActionBar actions={['correct', 'confirm']} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onAction).toHaveBeenCalledWith('confirm');
  });

  it('AC-005-14 mientras una acción está en curso desactiva las demás', () => {
    render(<ActionBar actions={['correct', 'confirm']} onAction={vi.fn()} pending="confirm" />);
    expect(screen.getByRole('button', { name: 'Corregir' })).toBeDisabled();
  });
});

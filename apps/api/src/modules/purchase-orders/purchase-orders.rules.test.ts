import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import { checkIssuedOn, checkReceipt } from './purchase-orders.rules.js';

const today = '2026-10-20';
const open = { status: 'open', receiptStatus: 'pending', issuedOn: '2026-10-10' } as const;

function errorOf(fn: () => void): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('No lanzó error');
}

describe('checkIssuedOn', () => {
  it('AC-003-03 acepta hoy y fechas pasadas', () => {
    expect(() => checkIssuedOn(today, today)).not.toThrow();
    expect(() => checkIssuedOn('2026-01-01', today)).not.toThrow();
  });

  it('AC-003-03 rechaza una fecha futura indicando el campo', () => {
    const error = errorOf(() => checkIssuedOn('2026-10-21', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toHaveProperty('issuedOn');
  });
});

describe('checkReceipt', () => {
  it('AC-003-04 acepta una OC abierta y pendiente con fecha entre la OC y hoy', () => {
    expect(() => checkReceipt(open, '2026-10-10', today)).not.toThrow();
    expect(() => checkReceipt(open, today, today)).not.toThrow();
  });

  it('AC-003-05 rechaza una OC cancelada con INVALID_TRANSITION', () => {
    const error = errorOf(() => checkReceipt({ ...open, status: 'cancelled' }, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.message).toBe('La OC está cancelada.');
  });

  it('AC-003-05 rechaza una recepción ya confirmada con INVALID_TRANSITION', () => {
    const error = errorOf(() => checkReceipt({ ...open, receiptStatus: 'received' }, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.message).toBe('La recepción ya fue confirmada.');
  });

  it('AC-003-05 la cancelada se evalúa antes que la ya recibida', () => {
    const po = { ...open, status: 'cancelled', receiptStatus: 'received' } as const;
    expect(errorOf(() => checkReceipt(po, today, today)).message).toBe('La OC está cancelada.');
  });

  it('AC-003-05 rechaza una fecha futura con fieldErrors.receivedOn', () => {
    const error = errorOf(() => checkReceipt(open, '2026-10-21', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({
      receivedOn: 'La fecha de recepción no puede ser futura',
    });
  });

  it('AC-003-05 rechaza una fecha anterior a la OC con fieldErrors.receivedOn', () => {
    const error = errorOf(() => checkReceipt(open, '2026-10-09', today));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({
      receivedOn: 'La recepción no puede ser anterior a la OC',
    });
  });
});

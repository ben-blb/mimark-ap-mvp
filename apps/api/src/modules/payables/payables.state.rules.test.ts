import { PAYABLE_STATUSES } from '@mimark/contracts/payables';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import { allowedActions, assertTransition, canRetry, TRANSITIONS } from './payables.state.rules.js';

const now = new Date('2026-10-20T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('assertTransition', () => {
  it('AC-005-04 solo se confirma desde pending_confirmation', () => {
    expect(() => assertTransition('pending_confirmation', 'confirmed')).not.toThrow();
    for (const from of PAYABLE_STATUSES.filter((s) => s !== 'pending_confirmation')) {
      expect(() => assertTransition(from, 'confirmed')).toThrow(AppError);
    }
  });

  it('AC-005-04 el error es INVALID_TRANSITION (409)', () => {
    try {
      assertTransition('requires_review', 'confirmed');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
    }
  });

  it('AC-005-04 ningún estado llega a confirmed, scheduled o paid sin pasar por el que le toca', () => {
    const sources = (to: string) =>
      PAYABLE_STATUSES.filter((s) => TRANSITIONS[s].includes(to as never));
    expect(sources('confirmed')).toEqual(['pending_confirmation']);
    expect(sources('scheduled').sort()).toEqual(['confirmed', 'scheduled']);
    expect(sources('paid')).toEqual(['scheduled']);
  });

  it('paid y discarded son finales', () => {
    expect(TRANSITIONS.paid).toEqual([]);
    expect(TRANSITIONS.discarded).toEqual([]);
  });
});

describe('allowedActions', () => {
  const actions = (status: (typeof PAYABLE_STATUSES)[number]) =>
    allowedActions(status, ago(1), now);

  it('AC-005-12 coincide con la tabla de acciones por estado', () => {
    expect(actions('failed')).toEqual(['retry', 'discard']);
    expect(actions('requires_review')).toEqual(['correct', 'discard']);
    expect(actions('pending_confirmation')).toEqual(['correct', 'confirm', 'discard']);
    expect(actions('out_of_scope')).toEqual(['correct', 'discard']);
    expect(actions('confirmed')).toEqual(['schedule', 'documents']);
    expect(actions('scheduled')).toEqual(['schedule', 'pay', 'documents']);
    expect(actions('paid')).toEqual(['documents']);
  });

  it('AC-005-11 uploaded, discarded y processing reciente no tienen acciones', () => {
    expect(actions('uploaded')).toEqual([]);
    expect(actions('discarded')).toEqual([]);
    expect(actions('processing')).toEqual([]);
  });

  it('AC-005-12 un processing atorado (más de 5 minutos) se puede reintentar', () => {
    expect(allowedActions('processing', ago(6), now)).toEqual(['retry']);
    expect(canRetry('processing', ago(5), now)).toBe(false);
    expect(canRetry('processing', ago(6), now)).toBe(true);
  });
});

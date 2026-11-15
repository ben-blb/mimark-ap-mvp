import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/app-error.js';
import { checkReceipt, checkReceiptLines } from './receipt.rules.js';

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

  it('AC-018-07 rechaza una recepción ya confirmada con diferencias', () => {
    const po = { ...open, receiptStatus: 'received_with_differences' } as const;
    const error = errorOf(() => checkReceipt(po, today, today));
    expect(error.code).toBe('INVALID_TRANSITION');
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

describe('checkReceiptLines', () => {
  const order = [
    { id: 'a', quantity: '75' },
    { id: 'b', quantity: '40' },
  ];
  const lines = (a: string, b?: string) => [
    { lineId: 'a', receivedQuantity: a },
    ...(b === undefined ? [] : [{ lineId: 'b', receivedQuantity: b }]),
  ];

  it('AC-018-01 todo completo, sin notas: received', () => {
    expect(checkReceiptLines(order, { lines: lines('75', '40') })).toEqual({
      status: 'received',
      differences: [],
    });
  });

  it('AC-018-01 acepta las partidas en cualquier orden', () => {
    const reversed = [
      { lineId: 'b', receivedQuantity: '40' },
      { lineId: 'a', receivedQuantity: '75' },
    ];
    expect(checkReceiptLines(order, { lines: reversed }).status).toBe('received');
  });

  it('AC-018-02 una partida corta con notas: received_with_differences', () => {
    expect(checkReceiptLines(order, { lines: lines('70', '40'), notes: 'Faltaron 5' })).toEqual({
      status: 'received_with_differences',
      differences: [{ lineId: 'a', ordered: '75', received: '70' }],
    });
  });

  it('AC-018-02 una partida en 0 con otra completa cuenta como diferencia', () => {
    const result = checkReceiptLines(order, { lines: lines('0', '40'), notes: 'No llegó' });
    expect(result.differences).toHaveLength(1);
  });

  it.each([undefined, '', '   '])('AC-018-03 con diferencias y notas %j: error notes', (notes) => {
    const error = errorOf(() => checkReceiptLines(order, { lines: lines('70', '40'), notes }));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({ notes: 'Explica qué faltó' });
  });

  it.each([
    ['falta una', lines('75'), 'Captura todas las partidas'],
    [
      'sobra una ajena',
      [...lines('75', '40'), { lineId: 'z', receivedQuantity: '1' }],
      'Hay partidas que no son de esta OC',
    ],
    [
      'repetida',
      [...lines('75', '40'), { lineId: 'a', receivedQuantity: '1' }],
      'Hay partidas repetidas',
    ],
    ['supera lo pedido', lines('76', '40'), 'No puedes recibir más de lo pedido'],
    ['no llegó nada', lines('0', '0'), 'Si no llegó nada, no hay recepción'],
    [
      'negativa',
      lines('-1', '40'),
      'Cantidad inválida: usa números de 0 o más con hasta 3 decimales',
    ],
    [
      '4 decimales',
      lines('1.2345', '40'),
      'Cantidad inválida: usa números de 0 o más con hasta 3 decimales',
    ],
  ])('AC-018-04 rechaza si %s', (_caso, input, message) => {
    const error = errorOf(() => checkReceiptLines(order, { lines: input, notes: 'x' }));
    expect(error.code).toBe('VALIDATION');
    expect(error.extra.fieldErrors).toEqual({ lines: message });
  });

  it('AC-018-04 compara con 3 decimales, sin punto flotante', () => {
    const decimals = [{ id: 'a', quantity: '0.3' }];
    expect(() =>
      checkReceiptLines(decimals, { lines: [{ lineId: 'a', receivedQuantity: '0.300' }] }),
    ).not.toThrow();
    expect(
      errorOf(() =>
        checkReceiptLines(decimals, { lines: [{ lineId: 'a', receivedQuantity: '0.301' }] }),
      ).extra.fieldErrors,
    ).toEqual({ lines: 'No puedes recibir más de lo pedido' });
  });

  it('AC-018-05 una OC sin partidas se recibe con lines vacío', () => {
    expect(checkReceiptLines([], { lines: [] })).toEqual({ status: 'received', differences: [] });
  });

  it('AC-018-05 una OC sin partidas rechaza partidas ajenas', () => {
    const error = errorOf(() => checkReceiptLines([], { lines: lines('1') }));
    expect(error.extra.fieldErrors).toEqual({ lines: 'Hay partidas que no son de esta OC' });
  });
});

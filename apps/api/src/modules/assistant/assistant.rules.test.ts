import { describe, expect, it } from 'vitest';
import { pickToolCalls, toModelMessages } from './assistant.rules.js';

const id = 'cmh0payable0000000000000';

describe('pickToolCalls', () => {
  it.each([
    ['getDashboard { horizon: 7 }', 'getDashboard', { horizon: 7 }, true],
    ['getDashboard { horizon: 9 }', 'getDashboard', { horizon: 9 }, false],
    ['schedulePayable con fecha', 'schedulePayable', { id, payOn: '2026-10-30' }, true],
    ['schedulePayable con "viernes"', 'schedulePayable', { id, payOn: 'viernes' }, false],
    ['deleteEverything', 'deleteEverything', {}, false],
    ['AC-011-03 uploadPayable (solo la web sube)', 'uploadPayable', {}, false],
    [
      'recordPayment completo',
      'recordPayment',
      { id, paidOn: '2026-10-27', amount: '100.00', reference: 'SPEI-1' },
      true,
    ],
    ['listPayables con varios estados', 'listPayables', { status: 'confirmed,scheduled' }, true],
    ['toString (propiedad heredada)', 'toString', {}, false],
  ])('AC-008-03 %s', (_, name, input, kept) => {
    const result = pickToolCalls([{ id: 'c1', name, input }], 'admin');
    expect(result).toEqual(kept ? [{ id: 'c1', name, input }] : []);
  });

  it('AC-008-03 devuelve la entrada sin transformar para que el endpoint la valide igual', () => {
    const [call] = pickToolCalls(
      [{ id: 'c1', name: 'listPayables', input: { status: 'paid' } }],
      'admin',
    );
    expect(call?.input).toEqual({ status: 'paid' });
  });
});

describe('pickToolCalls por rol', () => {
  const pay = { id, paidOn: '2026-10-27', amount: '100.00', reference: 'SPEI-1' };

  it.each([
    ['warehouse', 'recordPayment', pay, false],
    ['warehouse', 'listPayables', {}, false],
    ['warehouse', 'getDashboard', { horizon: 7 }, false],
    ['warehouse', 'listPurchaseOrders', {}, true],
    ['manager', 'recordPayment', pay, true],
    ['manager', 'correctFields', { id, supplierName: 'X' }, false],
    ['purchasing', 'confirmPayable', { id }, false],
    ['purchasing', 'listPayables', {}, true],
  ] as const)('AC-013-16 %s · %s → %s', (role, name, input, kept) => {
    expect(pickToolCalls([{ id: 'c1', name, input }], role)).toHaveLength(kept ? 1 : 0);
  });
});

describe('toModelMessages', () => {
  it('AC-008-03 traduce usuario, llamadas y resultados al formato del AI SDK', () => {
    const messages = toModelMessages([
      { role: 'user', text: 'Hola' },
      { role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'getDashboard', input: {} }] },
      { role: 'tool', toolCallId: 'c1', name: 'getDashboard', result: '{"items":[]}' },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: 'Hola' },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'getDashboard', input: {} }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'getDashboard',
            output: { type: 'text', value: '{"items":[]}' },
          },
        ],
      },
    ]);
  });
});

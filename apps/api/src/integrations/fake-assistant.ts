import type { AssistantAttachment } from '@mimark/contracts/assistant';
import type { LocalDate } from '@mimark/contracts/common';
import type { ModelMessage } from 'ai';

interface FakeTurn {
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
}

/** Modo `fake` (desarrollo y pruebas): responde por palabras clave del último mensaje, sin IA. */
export function fakeAssistant(
  messages: ModelMessage[],
  attachment: AssistantAttachment | undefined,
  today: LocalDate,
): FakeTurn {
  const last = messages.at(-1);
  if (last?.role !== 'user') return { text: 'Listo.', toolCalls: [] };

  const text = typeof last.content === 'string' ? last.content.toLowerCase() : '';
  const call = (name: string, input: unknown) => ({
    text: '',
    toolCalls: [{ id: `fake-${messages.length}`, name, input }],
  });

  const payment = /pago\s+(\S+)/.exec(text);
  if (payment?.[1]) {
    return call('recordPayment', {
      id: payment[1],
      paidOn: today,
      amount: '100.00',
      reference: 'FAKE-1',
    });
  }
  if (attachment && text.includes('sube')) return call('uploadPayable', {});
  if (text.includes('expedientes')) return call('listPayables', { status: 'confirmed,scheduled' });
  if (text.includes('vence')) return call('getDashboard', { horizon: 7 });
  if (text.includes('proveedor')) return call('listSuppliers', {});
  return {
    text: 'Modo de prueba: pregunta qué vence, por los expedientes o por los proveedores.',
    toolCalls: [],
  };
}

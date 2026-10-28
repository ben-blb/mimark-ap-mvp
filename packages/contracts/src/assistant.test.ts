import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ASSISTANT_TOOLS, AssistantTurnInput } from './assistant.js';

const user = (text: string) => ({ role: 'user', text });

describe('AssistantTurnInput', () => {
  it('AC-008-02 acepta una conversación dentro de los topes', () => {
    const input = {
      messages: [
        user('¿Qué vence esta semana?'),
        { role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'getDashboard', input: {} }] },
        { role: 'tool', toolCallId: 'c1', name: 'getDashboard', result: '{"items":[]}' },
      ],
      attachment: { fileName: 'factura.pdf', mimeType: 'application/pdf', size: 1000 },
    };
    expect(AssistantTurnInput.safeParse(input).success).toBe(true);
  });

  it.each([
    ['más de 40 mensajes', { messages: Array.from({ length: 41 }, () => user('hola')) }],
    ['texto de más de 2 000 caracteres', { messages: [user('a'.repeat(2001))] }],
    [
      'resultado de herramienta de más de 20 000 caracteres',
      {
        messages: [
          { role: 'tool', toolCallId: 'c1', name: 'getDashboard', result: 'x'.repeat(20_001) },
        ],
      },
    ],
    [
      'adjunto con tipo no permitido',
      {
        messages: [user('sube esto')],
        attachment: { fileName: 'a.exe', mimeType: 'application/x-msdownload', size: 10 },
      },
    ],
    [
      'herramienta fuera del catálogo',
      { messages: [{ role: 'tool', toolCallId: 'c', name: 'rm', result: '' }] },
    ],
    ['sin mensajes', { messages: [] }],
  ])('AC-008-02 rechaza %s', (_, input) => {
    expect(AssistantTurnInput.safeParse(input).success).toBe(false);
  });
});

describe('ASSISTANT_TOOLS', () => {
  it.each(Object.entries(ASSISTANT_TOOLS))(
    'AC-008-03 la entrada de %s se puede describir al modelo como JSON Schema',
    (_, tool) => {
      expect(() => z.toJSONSchema(tool.input, { io: 'input', target: 'draft-7' })).not.toThrow();
    },
  );
});

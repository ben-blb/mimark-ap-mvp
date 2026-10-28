import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS, WEB_ONLY_TOOLS } from '@mimark/contracts/assistant';
import { AssistantClient } from './assistant.client.js';
import { ASSISTANT_PROMPT } from './prompts/assistant.v2.js';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function model() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [
        { type: 'text', text: 'Reviso el tablero.' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'getDashboard',
          input: JSON.stringify({ horizon: 7 }),
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      usage,
      warnings: [],
    },
  });
}

describe('AssistantClient', () => {
  it('AC-008-09 envía solo nombre, tipo y tamaño del adjunto, la fecha de hoy y la versión del prompt', async () => {
    const m = model();
    const result = await new AssistantClient().run(m, {
      messages: [{ role: 'user', content: 'Sube esta factura' }],
      attachment: { fileName: 'factura-acme.pdf', mimeType: 'application/pdf', size: 1234 },
      today: '2026-10-27',
    });

    const [call] = m.doGenerateCalls;
    const prompt = JSON.stringify(call?.prompt);
    const first = call?.prompt[0];
    expect(first?.role).toBe('system');
    const system = first?.role === 'system' ? first.content : '';
    expect(system).toContain(ASSISTANT_PROMPT.text);
    expect(system).toContain('Hoy: 2026-10-27');
    expect(system).toContain('factura-acme.pdf (application/pdf, 1234 bytes)');
    expect(prompt).not.toContain('"type":"file"');
    expect(result.promptVersion).toBe('assistant@2');
  });

  it('AC-011-05 el prompt guía el alta: proveedor por RFC, OC con id real, recepción preguntada y reevaluación', () => {
    const text = ASSISTANT_PROMPT.text;
    expect(text).toContain('PO_NOT_FOUND');
    expect(text).toContain('listSuppliers'); // AC-011-05
    expect(text).toContain('días de crédito'); // se pregunta, no se infiere
    expect(text).toContain('createPurchaseOrder'); // AC-011-06
    expect(text).toContain('La fecha de la orden la da la persona');
    expect(text).toContain('RECEIPT_NOT_CONFIRMED'); // AC-011-07
    expect(text).toContain('recordReceipt');
    expect(text).toMatch(/correctFields[^.]*poNumber/); // AC-011-08
    expect(text).toContain('UNA escritura por vez');
  });

  it('AC-008-03 da al modelo el catálogo (menos la subida, AC-011-03) y devuelve sus llamadas sin ejecutarlas', async () => {
    const m = model();
    const result = await new AssistantClient().run(m, {
      messages: [{ role: 'user', content: '¿Qué vence?' }],
      today: '2026-10-27',
    });

    const tools = (m.doGenerateCalls[0]?.tools ?? []).map((t) => t.name);
    expect(tools.sort()).toEqual(
      Object.keys(ASSISTANT_TOOLS)
        .filter((name) => !WEB_ONLY_TOOLS.has(name))
        .sort(),
    );
    expect(m.doGenerateCalls).toHaveLength(1);
    expect(result.text).toBe('Reviso el tablero.');
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'getDashboard', input: { horizon: 7 } }]);
  });

  it('AC-010-06 en streaming entrega cada trozo de texto y junta las llamadas sin ejecutarlas', async () => {
    const m = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Reviso ' },
            { type: 'text-delta', id: 't1', delta: 'el tablero.' },
            { type: 'text-end', id: 't1' },
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'getDashboard',
              input: JSON.stringify({ horizon: 7 }),
            },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage },
          ],
        }),
      },
    });
    const deltas: string[] = [];
    const result = await new AssistantClient().runStream(
      m,
      { messages: [{ role: 'user', content: '¿Qué vence?' }], today: '2026-10-27' },
      new AbortController().signal,
      (text) => deltas.push(text),
    );
    expect(deltas).toEqual(['Reviso ', 'el tablero.']);
    expect(result.text).toBe('Reviso el tablero.');
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'getDashboard', input: { horizon: 7 } }]);
  });
});

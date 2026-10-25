import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { ExtractionClient } from './extraction.client.js';
import { fakeExtraction } from './fake-extraction.js';
import { EXTRACT_INVOICE } from './prompts/extract-invoice.v1.js';

const output = fakeExtraction(Buffer.from('%PDF-1.7 prueba'), 'factura.pdf');

describe('ExtractionClient', () => {
  it('AC-004-12 la llamada lleva solo las instrucciones versionadas y un archivo, sin herramientas', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      },
    });
    const bytes = Buffer.from('%PDF-1.7 prueba');

    const result = await new ExtractionClient().run(model, bytes, 'application/pdf');

    const [call] = model.doGenerateCalls;
    expect(call?.tools ?? []).toEqual([]);
    expect(call?.prompt).toHaveLength(2);
    expect(call?.prompt[0]).toMatchObject({ role: 'system', content: EXTRACT_INVOICE.text });
    const user = call?.prompt[1];
    expect(user?.role).toBe('user');
    expect(user?.content).toHaveLength(1);
    expect(user?.content[0]).toMatchObject({ type: 'file', mediaType: 'application/pdf' });
    expect(result).toMatchObject({ data: output, promptVersion: 'extract-invoice@1' });
  });

  it('AC-004-12 una salida fuera del esquema se propaga como error', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: '{"total":"mucho"}' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      },
    });
    await expect(
      new ExtractionClient().run(model, Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow();
  });
});

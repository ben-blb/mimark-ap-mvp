import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateText, Output, type LanguageModel } from 'ai';
import { ExtractionSchema, type Extraction } from '@mimark/contracts/extraction';
import { env } from '../config/env.js';
import { fakeExtraction } from './fake-extraction.js';
import { EXTRACT_INVOICE } from './prompts/extract-invoice.v1.js';

export interface ExtractionResult {
  data: Extraction;
  model: string;
  promptVersion: string;
  ms: number;
}

/**
 * Lee un documento con IA y devuelve solo el esquema de extracción. La llamada lleva las instrucciones
 * versionadas y el archivo: sin herramientas y sin datos de la base. Cualquier error se propaga.
 */
@Injectable()
export class ExtractionClient {
  async extract(input: {
    bytes: Buffer;
    mimeType: string;
    fileName: string;
  }): Promise<ExtractionResult> {
    const started = Date.now();
    if (env.AI_PROVIDER === 'fake') {
      const data = fakeExtraction(input.bytes, input.fileName);
      return { data, model: 'fake', promptVersion: 'fake', ms: Date.now() - started };
    }
    return this.run(this.model(), input.bytes, input.mimeType);
  }

  protected model(): LanguageModel {
    const id = env.AI_MODEL ?? '';
    return env.AI_PROVIDER === 'google' ? google(id) : anthropic(id);
  }

  /** Separado de `extract` para probar la forma de la llamada con un modelo simulado. */
  async run(model: LanguageModel, bytes: Buffer, mimeType: string): Promise<ExtractionResult> {
    const started = Date.now();
    const { output } = await generateText({
      model,
      instructions: EXTRACT_INVOICE.text,
      temperature: 0,
      maxRetries: 1,
      timeout: 60_000,
      messages: [{ role: 'user', content: [{ type: 'file', data: bytes, mediaType: mimeType }] }],
      output: Output.object({ schema: ExtractionSchema }),
    });
    const modelName = typeof model === 'string' ? model : model.modelId;
    return {
      data: ExtractionSchema.parse(output),
      model: modelName,
      promptVersion: EXTRACT_INVOICE.version,
      ms: Date.now() - started,
    };
  }
}

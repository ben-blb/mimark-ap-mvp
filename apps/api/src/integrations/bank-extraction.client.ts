import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateText, Output, type LanguageModel } from 'ai';
import { BankExtraction } from '@mimark/contracts/closing-uploads';
import { env } from '../config/env.js';
import { fakeBankExtraction } from './fake-bank-extraction.js';
import { EXTRACT_BANK_STATEMENT } from './prompts/extract-bank-statement.v1.js';

export interface BankExtractionResult {
  data: BankExtraction;
  model: string;
  promptVersion: string;
  ms: number;
}

/**
 * Lee el PDF de un estado de cuenta (spec 022) y devuelve solo el esquema `BankExtraction`: las instrucciones
 * versionadas y el archivo, sin herramientas ni datos de la base. Cualquier error se propaga.
 */
@Injectable()
export class BankExtractionClient {
  async extract(input: { bytes: Buffer; fileName: string }): Promise<BankExtractionResult> {
    const started = Date.now();
    if (env.AI_PROVIDER === 'fake') {
      const data = fakeBankExtraction(input.fileName);
      return { data, model: 'fake', promptVersion: 'fake', ms: Date.now() - started };
    }
    return this.run(this.model(), input.bytes);
  }

  protected model(): LanguageModel {
    const id = env.AI_MODEL ?? '';
    return env.AI_PROVIDER === 'google' ? google(id) : anthropic(id);
  }

  /** Separado de `extract` para probar la forma de la llamada con un modelo simulado. */
  async run(model: LanguageModel, bytes: Buffer): Promise<BankExtractionResult> {
    const started = Date.now();
    const { output } = await generateText({
      model,
      instructions: EXTRACT_BANK_STATEMENT.text,
      temperature: 0,
      maxRetries: 1,
      // Un estado de cuenta largo tarda más que una factura, pero la función vive 300 s.
      timeout: 240_000,
      messages: [
        { role: 'user', content: [{ type: 'file', data: bytes, mediaType: 'application/pdf' }] },
      ],
      output: Output.object({ schema: BankExtraction }),
    });
    const modelName = typeof model === 'string' ? model : model.modelId;
    return {
      data: BankExtraction.parse(output),
      model: modelName,
      promptVersion: EXTRACT_BANK_STATEMENT.version,
      ms: Date.now() - started,
    };
  }
}

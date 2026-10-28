import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import {
  generateText,
  jsonSchema,
  streamText,
  tool,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { z } from 'zod';
import {
  ASSISTANT_TOOLS,
  WEB_ONLY_TOOLS,
  type AssistantAttachment,
} from '@mimark/contracts/assistant';
import type { LocalDate } from '@mimark/contracts/common';
import { env } from '../config/env.js';
import { fakeAssistant } from './fake-assistant.js';
import { ASSISTANT_PROMPT } from './prompts/assistant.v2.js';

export interface AssistantInput {
  messages: ModelMessage[];
  attachment?: AssistantAttachment;
  today: LocalDate;
}

export interface AssistantResult {
  text: string;
  /** Sin validar: el service las filtra con el catálogo. */
  toolCalls: { id: string; name: string; input: unknown }[];
  model: string;
  promptVersion: string;
  ms: number;
}

/**
 * Herramientas del catálogo SIN `execute`: el modelo solo puede proponer llamadas; nada se ejecuta aquí.
 * Se describe la entrada como JSON Schema sin validarla, para devolver lo que escribió el modelo y validarlo una
 * sola vez en las reglas.
 */
const TOOLS = Object.fromEntries(
  Object.entries(ASSISTANT_TOOLS)
    .filter(([name]) => !WEB_ONLY_TOOLS.has(name))
    .map(([name, t]) => [
    name,
    tool({
      description: t.description,
      inputSchema: jsonSchema(
        z.toJSONSchema(t.input, { io: 'input', target: 'draft-7' }) as JSONSchema7,
      ),
    }),
  ]),
);

/** Habla con el LLM del asistente. Lleva instrucciones versionadas, la fecha y los metadatos del adjunto. */
@Injectable()
export class AssistantClient {
  async turn(input: AssistantInput): Promise<AssistantResult> {
    const started = Date.now();
    if (env.AI_PROVIDER === 'fake') {
      const result = fakeAssistant(input.messages, input.attachment, input.today);
      return { ...result, model: 'fake', promptVersion: 'fake', ms: Date.now() - started };
    }
    return this.run(this.model(), input);
  }

  /**
   * Como `turn`, pero entrega el texto en trozos con `onDelta` mientras el modelo escribe (spec 010). `signal`
   * aborta la llamada cuando la persona se va.
   */
  async stream(
    input: AssistantInput,
    signal: AbortSignal,
    onDelta: (text: string) => void,
  ): Promise<AssistantResult> {
    const started = Date.now();
    if (env.AI_PROVIDER === 'fake') {
      const result = fakeAssistant(input.messages, input.attachment, input.today);
      for (const chunk of result.text.match(/\S+\s*/g) ?? []) {
        if (signal.aborted) break;
        onDelta(chunk);
      }
      return { ...result, model: 'fake', promptVersion: 'fake', ms: Date.now() - started };
    }
    return this.runStream(this.model(), input, signal, onDelta);
  }

  /** Separado de `stream` para probar la forma de la llamada con un modelo simulado. */
  async runStream(
    model: LanguageModel,
    input: AssistantInput,
    signal: AbortSignal,
    onDelta: (text: string) => void,
  ): Promise<AssistantResult> {
    const started = Date.now();
    const result = streamText({
      model,
      instructions: instructions(input),
      temperature: 0,
      maxRetries: 1,
      timeout: 60_000,
      maxOutputTokens: 2000,
      messages: input.messages,
      tools: TOOLS,
      abortSignal: signal,
    });
    let text = '';
    const toolCalls: AssistantResult['toolCalls'] = [];
    for await (const part of result.stream) {
      if (part.type === 'text-delta') {
        text += part.text;
        onDelta(part.text);
      } else if (part.type === 'tool-call') {
        toolCalls.push({ id: part.toolCallId, name: part.toolName, input: part.input });
      } else if (part.type === 'error') {
        throw part.error;
      }
    }
    return {
      text,
      toolCalls,
      model: typeof model === 'string' ? model : model.modelId,
      promptVersion: ASSISTANT_PROMPT.version,
      ms: Date.now() - started,
    };
  }

  protected model(): LanguageModel {
    const id = env.AI_MODEL ?? '';
    return env.AI_PROVIDER === 'google' ? google(id) : anthropic(id);
  }

  /** Separado de `turn` para probar la forma de la llamada con un modelo simulado. */
  async run(model: LanguageModel, input: AssistantInput): Promise<AssistantResult> {
    const started = Date.now();
    const result = await generateText({
      model,
      instructions: instructions(input),
      temperature: 0,
      maxRetries: 1,
      timeout: 60_000,
      maxOutputTokens: 2000,
      messages: input.messages,
      tools: TOOLS,
    });
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({
        id: c.toolCallId,
        name: c.toolName,
        input: c.input,
      })),
      model: typeof model === 'string' ? model : model.modelId,
      promptVersion: ASSISTANT_PROMPT.version,
      ms: Date.now() - started,
    };
  }
}

/** El adjunto solo se describe: sus bytes nunca llegan al modelo. */
function instructions({ today, attachment }: AssistantInput): string {
  const file = attachment
    ? `${attachment.fileName} (${attachment.mimeType}, ${attachment.size} bytes)`
    : 'ninguno';
  return `${ASSISTANT_PROMPT.text}\n\nDatos de la sesión:\n- Hoy: ${today}\n- Archivo adjunto: ${file}`;
}

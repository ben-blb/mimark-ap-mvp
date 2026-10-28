import {
  ASSISTANT_TOOLS,
  type AssistantMessage,
  type AssistantToolCall,
} from '@mimark/contracts/assistant';
import type { ModelMessage } from 'ai';
import { AppError } from '../../common/app-error.js';

/** Llamada tal como la devolvió el modelo, antes de validarla. */
export interface RawToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Conversación del contrato → mensajes del AI SDK. Los resultados de herramientas viajan como texto. */
export function toModelMessages(messages: AssistantMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.text };
      case 'assistant':
        return {
          role: 'assistant',
          content: [
            ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
            ...message.toolCalls.map((call) => ({
              type: 'tool-call' as const,
              toolCallId: call.id,
              toolName: call.name,
              input: call.input ?? {},
            })),
          ],
        };
      case 'tool':
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: message.toolCallId,
              toolName: message.name,
              output: { type: 'text', value: message.result },
            },
          ],
        };
    }
  });
}

/**
 * Conserva solo las llamadas a herramientas del catálogo cuya entrada pasa su esquema. Devuelve la entrada tal
 * como la escribió el modelo: el endpoint que la reciba la vuelve a validar con el mismo esquema.
 */
export function pickToolCalls(calls: RawToolCall[]): AssistantToolCall[] {
  return calls.flatMap((call) => {
    if (!Object.hasOwn(ASSISTANT_TOOLS, call.name)) return [];
    const name = call.name as keyof typeof ASSISTANT_TOOLS;
    if (!ASSISTANT_TOOLS[name].input.safeParse(call.input).success) return [];
    return [{ id: call.id, name, input: call.input }];
  });
}

/** Cuota diaria de turnos por persona (ADR-08: se cuenta en audit_events). */
export function checkAssistantQuota(used: number, limit: number): void {
  if (used >= limit) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      'Se alcanzó el límite diario del asistente. Intenta mañana.',
    );
  }
}

import {
  type AssistantMessage,
  type AssistantToolCall,
  type AssistantToolName,
  MAX_ASSISTANT_MESSAGES,
} from '@mimark/contracts/assistant';
import type { ConversationDecision, ConversationDto } from '@mimark/contracts/conversations';
import type { Decision } from './MessageList';
import type { ToolRun } from './ToolCallRow';
import { toolRenderers } from './toolRenderers';

export const toolMessage = (call: AssistantToolCall, result: string): AssistantMessage => ({
  role: 'tool',
  toolCallId: call.id,
  name: call.name,
  result,
});

/** Los últimos mensajes que caben, empezando siempre por un mensaje de la persona. */
export function recent(conversation: AssistantMessage[]): AssistantMessage[] {
  const tail = conversation.slice(-MAX_ASSISTANT_MESSAGES);
  const start = tail.findIndex((m) => m.role === 'user');
  return start > 0 ? tail.slice(start) : tail;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** El último resultado de lectura con valor, para proponer seguimientos. */
export function lastRead(
  messages: AssistantMessage[],
  runs: Record<string, ToolRun>,
): { name: AssistantToolName; value: unknown } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user') return undefined;
    if (m?.role !== 'assistant') continue;
    for (const call of [...m.toolCalls].reverse()) {
      const run = runs[call.id];
      if (run?.status === 'done' && toolRenderers[call.name]) {
        return { name: call.name, value: run.value };
      }
    }
  }
  return undefined;
}

/** Título de una conversación: las primeras palabras de lo primero que escribió la persona. */
export function titleOf(messages: AssistantMessage[]): string {
  const first =
    messages
      .find((m) => m.role === 'user')
      ?.text.replace(/\s+/g, ' ')
      .trim() ?? '';
  return first.length > 60 ? `${first.slice(0, 57)}…` : first || 'Conversación';
}

/** Las decisiones a guardar: lo que se está ejecutando todavía cuenta como pendiente. */
export function toStoredDecisions(
  decisions: Record<string, Decision>,
): Record<string, ConversationDecision> {
  return Object.fromEntries(
    Object.entries(decisions).map(([id, d]) => [
      id,
      {
        status: d.status === 'running' ? 'pending' : d.status,
        ...(d.error && { error: d.error.slice(0, 500) }),
        ...(d.at && { at: d.at.toISOString() }),
      } as ConversationDecision,
    ]),
  );
}

/**
 * Reconstruye lo que se dibuja al abrir una conversación guardada. Las lecturas se rehacen desde el resultado
 * que quedó en la conversación; las propuestas que nadie decidió quedan "sin decidir", sin botones: abrir una
 * conversación nunca ejecuta nada (AC-011-17).
 */
export function restore(dto: ConversationDto): {
  messages: AssistantMessage[];
  runs: Record<string, ToolRun>;
  decisions: Record<string, Decision>;
} {
  const runs: Record<string, ToolRun> = {};
  for (const message of dto.messages) {
    if (message.role !== 'tool') continue;
    try {
      const value: unknown = JSON.parse(message.result);
      const error =
        value && typeof value === 'object' && 'error' in value ? String(value.error) : undefined;
      runs[message.toolCallId] = error ? { status: 'failed', error } : { status: 'done', value };
    } catch {
      // Resultado recortado por el tope: se muestra la fila sin su componente.
      runs[message.toolCallId] = { status: 'done' };
    }
  }
  const decisions: Record<string, Decision> = {};
  for (const [id, d] of Object.entries(dto.decisions)) {
    decisions[id] = {
      status: d.status === 'pending' ? 'stale' : d.status,
      error: d.error,
      at: d.at ? new Date(d.at) : undefined,
    };
  }
  return { messages: dto.messages, runs, decisions };
}

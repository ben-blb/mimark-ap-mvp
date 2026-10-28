import {
  type AssistantMessage,
  type AssistantToolCall,
  type AssistantToolName,
  MAX_ASSISTANT_MESSAGES,
} from '@mimark/contracts/assistant';
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

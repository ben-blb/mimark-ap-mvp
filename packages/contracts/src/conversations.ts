import { z } from 'zod';
import { AssistantMessage } from './assistant.js';
import { listOf } from './common.js';

export const MAX_CONVERSATION_MESSAGES = 200;
export const MAX_CONVERSATION_TITLE = 120;

/** Qué pasó con una propuesta de escritura; sirve para dibujarla como resuelta al reabrir la conversación. */
export const ConversationDecision = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'failed']),
  error: z.string().max(500).optional(),
  at: z.iso.datetime().optional(),
});
export type ConversationDecision = z.infer<typeof ConversationDecision>;

export const ConversationSummary = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationList = listOf(ConversationSummary);
export type ConversationList = z.infer<typeof ConversationList>;

/** La conversación completa se reemplaza en cada guardado (spec 011). */
export const SaveConversationInput = z.object({
  title: z.string().trim().min(1).max(MAX_CONVERSATION_TITLE),
  messages: z.array(AssistantMessage).min(1).max(MAX_CONVERSATION_MESSAGES),
  decisions: z.record(z.string().max(100), ConversationDecision).default({}),
});
export type SaveConversationInput = z.input<typeof SaveConversationInput>;

export const ConversationDto = ConversationSummary.extend({
  messages: z.array(AssistantMessage),
  decisions: z.record(z.string(), ConversationDecision),
});
export type ConversationDto = z.infer<typeof ConversationDto>;

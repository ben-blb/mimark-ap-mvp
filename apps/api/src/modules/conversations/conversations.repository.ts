import { Injectable } from '@nestjs/common';
import type { AssistantMessage } from '@mimark/contracts/assistant';
import type { ConversationDecision } from '@mimark/contracts/conversations';
import { Db, type Tx } from '../../common/db.js';
import type { Conversation, ConversationMessage, Prisma } from '../../generated/prisma/client.js';

export type ConversationRow = Conversation & { messages: ConversationMessage[] };

/** Única puerta a las tablas de conversaciones. Siempre filtra por la persona dueña. */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly db: Db) {}

  listFor(actor: string): Promise<Conversation[]> {
    return this.db.conversation.findMany({ where: { actor }, orderBy: { updatedAt: 'desc' } });
  }

  find(id: string, actor: string, tx: Tx = this.db): Promise<ConversationRow | null> {
    return tx.conversation.findFirst({
      where: { id, actor },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
  }

  /** ¿Existe ese id para otra persona? Evita pisar o adivinar conversaciones ajenas. */
  async isOwnedByOther(id: string, actor: string, tx: Tx = this.db): Promise<boolean> {
    const row = await tx.conversation.findUnique({ where: { id }, select: { actor: true } });
    return row !== null && row.actor !== actor;
  }

  /** Crea o reemplaza la conversación completa: título, decisiones y mensajes. */
  async save(
    input: {
      id: string;
      actor: string;
      title: string;
      messages: AssistantMessage[];
      decisions: Record<string, ConversationDecision>;
    },
    tx: Tx,
  ): Promise<void> {
    const { id, actor, title, messages } = input;
    const decisions = input.decisions as Prisma.InputJsonValue;
    await tx.conversation.upsert({
      where: { id },
      create: { id, actor, title, decisions },
      update: { title, decisions },
    });
    await tx.conversationMessage.deleteMany({ where: { conversationId: id } });
    await tx.conversationMessage.createMany({
      data: messages.map((message, seq) => ({
        conversationId: id,
        seq,
        payload: message as Prisma.InputJsonValue,
      })),
    });
  }

  async delete(id: string, actor: string, tx: Tx): Promise<boolean> {
    const { count } = await tx.conversation.deleteMany({ where: { id, actor } });
    return count > 0;
  }
}

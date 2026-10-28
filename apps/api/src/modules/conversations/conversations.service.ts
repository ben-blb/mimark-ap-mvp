import { Injectable } from '@nestjs/common';
import { AssistantMessage } from '@mimark/contracts/assistant';
import {
  type ConversationDecision,
  type ConversationDto,
  type ConversationList,
  type SaveConversationInput,
} from '@mimark/contracts/conversations';
import { z } from 'zod';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { ConversationsRepository, type ConversationRow } from './conversations.repository.js';

const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe esa conversación.');

/**
 * Las conversaciones del asistente de cada persona (spec 011). Guardar no ejecuta nada: solo conserva lo que
 * la persona ya vio. La auditoría registra el hecho, nunca el texto.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly db: Db,
    private readonly conversations: ConversationsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(ctx: Ctx): Promise<ConversationList> {
    const rows = await this.conversations.listFor(ctx.actor);
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async get(id: string, ctx: Ctx): Promise<ConversationDto> {
    const row = await this.conversations.find(id, ctx.actor);
    if (!row) throw NOT_FOUND();
    return toDto(row);
  }

  save(id: string, input: SaveConversationInput, ctx: Ctx): Promise<ConversationDto> {
    return this.db.$transaction(async (tx) => {
      // Un id de otra persona se trata como inexistente: no se revela ni se pisa.
      if (await this.conversations.isOwnedByOther(id, ctx.actor, tx)) throw NOT_FOUND();
      await this.conversations.save(
        {
          id,
          actor: ctx.actor,
          title: input.title.trim(),
          messages: input.messages,
          decisions: input.decisions ?? {},
        },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'conversation',
          entityId: id,
          action: 'conversation.saved',
          data: { messages: input.messages.length },
        },
        tx,
      );
      const row = await this.conversations.find(id, ctx.actor, tx);
      if (!row) throw NOT_FOUND();
      return toDto(row);
    });
  }

  delete(id: string, ctx: Ctx): Promise<void> {
    return this.db.$transaction(async (tx) => {
      if (!(await this.conversations.delete(id, ctx.actor, tx))) throw NOT_FOUND();
      await this.audit.log(
        { ...ctx, entity: 'conversation', entityId: id, action: 'conversation.deleted' },
        tx,
      );
    });
  }
}

function toDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messages: z.array(AssistantMessage).parse(row.messages.map((m) => m.payload)),
    decisions: row.decisions as Record<string, ConversationDecision>,
  };
}

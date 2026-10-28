import { Injectable } from '@nestjs/common';
import type { AssistantTurnInput, AssistantTurnOutput } from '@mimark/contracts/assistant';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { startOfLocalDay, toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import { AssistantClient, type AssistantResult } from '../../integrations/assistant.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { checkAssistantQuota, pickToolCalls, toModelMessages } from './assistant.rules.js';

const TURN_ACTION = 'assistant.answered';

/**
 * Un turno del asistente (spec 008): cuota, una llamada al modelo y auditoría. No lee ni escribe datos del
 * negocio: el modelo solo propone llamadas y la web las ejecuta por los endpoints de cada módulo.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly client: AssistantClient,
    private readonly audit: AuditRepository,
  ) {}

  async turn(input: AssistantTurnInput, ctx: Ctx): Promise<AssistantTurnOutput> {
    const today = toLocalDate(new Date(), env.BUSINESS_TZ);
    const used = await this.audit.countSince({
      action: TURN_ACTION,
      actor: ctx.actor,
      since: startOfLocalDay(today, env.BUSINESS_TZ),
    });
    checkAssistantQuota(used, env.DAILY_ASSISTANT_LIMIT);

    let result: AssistantResult;
    try {
      result = await this.client.turn({
        messages: toModelMessages(input.messages),
        attachment: input.attachment,
        today,
      });
    } catch {
      throw new AppError('AI_UNAVAILABLE', 'El asistente no está disponible. Intenta de nuevo.');
    }

    const toolCalls = pickToolCalls(result.toolCalls);
    // Sin el texto de la conversación: puede traer datos de documentos.
    await this.audit.log({
      ...ctx,
      entity: 'assistant',
      action: TURN_ACTION,
      data: {
        model: result.model,
        promptVersion: result.promptVersion,
        ms: result.ms,
        tools: toolCalls.map((c) => c.name),
      },
    });
    return { text: result.text, toolCalls };
  }
}

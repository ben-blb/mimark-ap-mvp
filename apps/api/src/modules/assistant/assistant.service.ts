import { Injectable } from '@nestjs/common';
import type { AssistantTurnInput, AssistantTurnOutput } from '@mimark/contracts/assistant';
import type { LocalDate } from '@mimark/contracts/common';
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
    const today = await this.checkQuota(ctx);
    let result: AssistantResult;
    try {
      result = await this.client.turn(this.request(input, today));
    } catch {
      throw unavailable();
    }
    return this.finish(result, ctx);
  }

  /**
   * Igual que `turn`, con el texto en trozos (spec 010, AC-010-06). La cuota se revisa antes de llamar a
   * `onDelta`, así que un 429 todavía sale como JSON. Si la persona se va (`signal`), el turno se audita igual.
   */
  async stream(
    input: AssistantTurnInput,
    ctx: Ctx,
    signal: AbortSignal,
    onDelta: (text: string) => void,
  ): Promise<AssistantTurnOutput> {
    const today = await this.checkQuota(ctx);
    const started = Date.now();
    let result: AssistantResult;
    try {
      result = await this.client.stream(this.request(input, today), signal, onDelta);
    } catch {
      if (!signal.aborted) throw unavailable();
      result = {
        text: '',
        toolCalls: [],
        model: 'aborted',
        promptVersion: '',
        ms: Date.now() - started,
      };
    }
    return this.finish(result, ctx);
  }

  /** Revisa la cuota diaria de la persona y devuelve "hoy" en la zona del negocio. */
  private async checkQuota(ctx: Ctx): Promise<LocalDate> {
    const today = toLocalDate(new Date(), env.BUSINESS_TZ);
    const used = await this.audit.countSince({
      action: TURN_ACTION,
      actor: ctx.actor,
      since: startOfLocalDay(today, env.BUSINESS_TZ),
    });
    checkAssistantQuota(used, env.DAILY_ASSISTANT_LIMIT);
    return today;
  }

  private request(input: AssistantTurnInput, today: LocalDate) {
    return { messages: toModelMessages(input.messages), attachment: input.attachment, today };
  }

  /** Filtra las llamadas con el catálogo y audita el turno. */
  private async finish(result: AssistantResult, ctx: Ctx): Promise<AssistantTurnOutput> {
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

const unavailable = () =>
  new AppError('AI_UNAVAILABLE', 'El asistente no está disponible. Intenta de nuevo.');

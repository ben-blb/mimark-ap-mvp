import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import {
  type AssistantStreamEvent,
  AssistantTurnInput,
  type AssistantTurnOutput,
} from '@mimark/contracts/assistant';
import type { Response } from 'express';
import { AppError } from '../../common/app-error.js';
import { Ctx } from '../../common/ctx.js';
import { AssistantService } from './assistant.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('turn')
  @HttpCode(200)
  turn(
    @Body({ schema: AssistantTurnInput }) input: AssistantTurnInput,
    @Ctx() ctx: Ctx,
  ): Promise<AssistantTurnOutput> {
    return this.assistant.turn(input, ctx);
  }

  /**
   * El mismo turno como Server-Sent Events (spec 010, AC-010-06). Los encabezados del stream se envían con el
   * primer evento: un error antes (sesión, validación, cuota) sale como JSON por el filtro de errores.
   */
  @Post('stream')
  async stream(
    @Body({ schema: AssistantTurnInput }) input: AssistantTurnInput,
    @Ctx() ctx: Ctx,
    @Res() res: Response,
  ): Promise<void> {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const send = (event: AssistantStreamEvent) => {
      if (!res.headersSent) {
        res.status(200);
        res.setHeader('content-type', 'text/event-stream; charset=utf-8');
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('x-accel-buffering', 'no');
        res.flushHeaders();
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const out = await this.assistant.stream(input, ctx, abort.signal, (text) =>
        send({ type: 'delta', text }),
      );
      if (!abort.signal.aborted) send({ type: 'done', ...out });
    } catch (error) {
      if (!res.headersSent) throw error;
      const known = error instanceof AppError ? error : new AppError('AI_UNAVAILABLE');
      send({ type: 'error', code: known.code, message: known.message });
    }
    res.end();
  }
}

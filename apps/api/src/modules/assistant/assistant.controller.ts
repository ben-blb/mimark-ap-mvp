import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AssistantTurnInput, type AssistantTurnOutput } from '@mimark/contracts/assistant';
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
}

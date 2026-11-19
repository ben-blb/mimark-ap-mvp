import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  ReopenInput,
  type CantaloupeList,
  type CheckList,
  type PeriodDto,
} from '@mimark/contracts/closing-review';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingChecksService } from './closing-checks.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing/periods/:id')
export class ClosingChecksController {
  constructor(private readonly checks: ClosingChecksService) {}

  @Requires('reports:read')
  @Get('checks')
  list(@Param('id', { schema: Id }) id: string): Promise<CheckList> {
    return this.checks.checks(id);
  }

  @Requires('reports:read')
  @Get('cantaloupe')
  cantaloupe(@Param('id', { schema: Id }) id: string): Promise<CantaloupeList> {
    return this.checks.cantaloupe(id);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post('close')
  close(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<PeriodDto> {
    return this.checks.close(id, ctx);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post('reopen')
  reopen(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ReopenInput }) input: ReopenInput,
    @Ctx() ctx: Ctx,
  ): Promise<PeriodDto> {
    return this.checks.reopen(id, input, ctx);
  }
}

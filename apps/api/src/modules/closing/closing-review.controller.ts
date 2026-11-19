import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  ClassifyAndRuleInput,
  ClassifyEntryInput,
  PeriodQuery,
  ReviewQuery,
  type ClassifyAndRuleResult,
  type ClassifyResultDto,
  type PeriodList,
  type ReviewList,
} from '@mimark/contracts/closing-review';
import type { LedgerEntryDto } from '@mimark/contracts/closing-uploads';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingReviewService } from './closing-review.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing')
export class ClosingReviewController {
  constructor(private readonly review: ClosingReviewService) {}

  @Requires('reports:read')
  @Get('periods')
  periods(@Query({ schema: PeriodQuery }) query: PeriodQuery): Promise<PeriodList> {
    return this.review.listPeriods(query);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post('periods/:id/classify')
  classify(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<ClassifyResultDto> {
    return this.review.classify(id, ctx);
  }

  @Requires('reports:read')
  @Get('review')
  list(@Query({ schema: ReviewQuery }) query: ReviewQuery): Promise<ReviewList> {
    return this.review.review(query);
  }

  @Requires('reports:write')
  @Patch('entries/:id')
  classifyEntry(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ClassifyEntryInput }) input: ClassifyEntryInput,
    @Ctx() ctx: Ctx,
  ): Promise<LedgerEntryDto> {
    return this.review.classifyEntry(id, input, ctx);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post('entries/:id/classify-and-rule')
  classifyAndRule(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ClassifyAndRuleInput }) input: ClassifyAndRuleInput,
    @Ctx() ctx: Ctx,
  ): Promise<ClassifyAndRuleResult> {
    return this.review.classifyAndRule(id, input, ctx);
  }
}

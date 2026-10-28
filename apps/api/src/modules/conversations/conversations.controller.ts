import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  type ConversationDto,
  type ConversationList,
  SaveConversationInput,
} from '@mimark/contracts/conversations';
import { z } from 'zod';
import { Ctx } from '../../common/ctx.js';
import { ConversationsService } from './conversations.service.js';

const ConversationId = z.uuid();

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@Ctx() ctx: Ctx): Promise<ConversationList> {
    return this.conversations.list(ctx);
  }

  @Get(':id')
  get(
    @Param('id', { schema: ConversationId }) id: string,
    @Ctx() ctx: Ctx,
  ): Promise<ConversationDto> {
    return this.conversations.get(id, ctx);
  }

  @Put(':id')
  save(
    @Param('id', { schema: ConversationId }) id: string,
    @Body({ schema: SaveConversationInput }) input: SaveConversationInput,
    @Ctx() ctx: Ctx,
  ): Promise<ConversationDto> {
    return this.conversations.save(id, input, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id', { schema: ConversationId }) id: string, @Ctx() ctx: Ctx): Promise<void> {
    return this.conversations.delete(id, ctx);
  }
}

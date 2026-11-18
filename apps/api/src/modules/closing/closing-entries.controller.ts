import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CreateEntryInput,
  EntryListQuery,
  type EntryList,
  type LedgerEntryDto,
} from '@mimark/contracts/closing-uploads';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingEntriesService } from './closing-entries.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing/entries')
export class ClosingEntriesController {
  constructor(private readonly entries: ClosingEntriesService) {}

  @Requires('reports:write')
  @Post()
  create(
    @Body({ schema: CreateEntryInput }) input: CreateEntryInput,
    @Ctx() ctx: Ctx,
  ): Promise<LedgerEntryDto> {
    return this.entries.create(input, ctx);
  }

  @Requires('reports:read')
  @Get()
  list(@Query({ schema: EntryListQuery }) query: EntryListQuery): Promise<EntryList> {
    return this.entries.list(query);
  }
}

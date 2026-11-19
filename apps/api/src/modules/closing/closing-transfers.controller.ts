import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import { CreateTransferInput, type TransferDto } from '@mimark/contracts/closing-review';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingTransfersService } from './closing-transfers.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing/transfers')
export class ClosingTransfersController {
  constructor(private readonly transfers: ClosingTransfersService) {}

  @Requires('reports:write')
  @Post()
  create(
    @Body({ schema: CreateTransferInput }) input: CreateTransferInput,
    @Ctx() ctx: Ctx,
  ): Promise<TransferDto> {
    return this.transfers.create(input, ctx);
  }

  @Requires('reports:write')
  @Delete(':id')
  remove(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<TransferDto> {
    return this.transfers.remove(id, ctx);
  }
}

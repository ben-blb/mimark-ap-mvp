import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Id } from '@mimark/contracts/common';
import { MAX_FILE_BYTES } from '@mimark/contracts/payables';
import {
  CreatePurchaseOrderInput,
  type PurchaseOrderDraft,
  type PurchaseOrderDto,
  type PurchaseOrderList,
  PurchaseOrderListQuery,
  ReceiptInput,
  UpdatePurchaseOrderInput,
} from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import { Ctx } from '../../common/ctx.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { Requires } from '../session/session.guard.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  list(
    @Query({ schema: PurchaseOrderListQuery }) query: PurchaseOrderListQuery,
  ): Promise<PurchaseOrderList> {
    return this.orders.list(query);
  }

  /** Antes de `:id` para que "extract" no se tome como un id. Solo lee el PDF: no crea ninguna OC. */
  @Requires('orders:write')
  @Post('extract')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  extract(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDraft> {
    if (!file) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { file: 'Elige un archivo' } });
    }
    return this.orders.extract(file, ctx);
  }

  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<PurchaseOrderDto> {
    return this.orders.get(id);
  }

  @Requires('orders:write')
  @Post()
  create(
    @Body({ schema: CreatePurchaseOrderInput }) input: CreatePurchaseOrderInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.create(input, ctx);
  }

  @Requires('orders:write')
  @Patch(':id')
  update(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdatePurchaseOrderInput }) input: UpdatePurchaseOrderInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.update(id, input, ctx);
  }

  @Requires('orders:receive')
  @Post(':id/receipt')
  confirmReceipt(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ReceiptInput }) input: ReceiptInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.confirmReceipt(id, input, ctx);
  }
}

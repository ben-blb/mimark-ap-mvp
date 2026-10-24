import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  CreatePurchaseOrderInput,
  type PurchaseOrderDto,
  type PurchaseOrderList,
  PurchaseOrderListQuery,
  ReceiptInput,
  UpdatePurchaseOrderInput,
} from '@mimark/contracts/purchase-orders';
import { Ctx } from '../../common/ctx.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

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

  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<PurchaseOrderDto> {
    return this.orders.get(id);
  }

  @Post()
  create(
    @Body({ schema: CreatePurchaseOrderInput }) input: CreatePurchaseOrderInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.create(input, ctx);
  }

  @Patch(':id')
  update(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdatePurchaseOrderInput }) input: UpdatePurchaseOrderInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.update(id, input, ctx);
  }

  @Post(':id/receipt')
  confirmReceipt(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ReceiptInput }) input: ReceiptInput,
    @Ctx() ctx: Ctx,
  ): Promise<PurchaseOrderDto> {
    return this.orders.confirmReceipt(id, input, ctx);
  }
}

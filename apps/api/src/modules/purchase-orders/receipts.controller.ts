import { Controller, Get, Param, Query } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  ReceiptListQuery,
  type ReceiptOrderDto,
  type ReceiptOrderList,
} from '@mimark/contracts/receipts';
import { Requires } from '../session/session.guard.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

/** Recepciones sin precios para Almacén (spec 017). Confirmar sigue en `POST /purchase-orders/:id/receipt`. */
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Requires('orders:receive')
  @Get()
  list(@Query({ schema: ReceiptListQuery }) query: ReceiptListQuery): Promise<ReceiptOrderList> {
    return this.orders.listReceipts(query);
  }

  @Requires('orders:receive')
  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<ReceiptOrderDto> {
    return this.orders.getReceipt(id);
  }
}

import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { PurchaseOrdersRepository } from './purchase-orders.repository.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

@Module({
  imports: [SuppliersModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersRepository],
  // Otros módulos (spec 004) pueden leer OC a través del repositorio (nunca escribir).
  exports: [PurchaseOrdersRepository],
})
export class PurchaseOrdersModule {}

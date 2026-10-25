import { Module } from '@nestjs/common';
import { ExtractionClient } from '../../integrations/extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { PayablesController } from './payables.controller.js';
import { PayablesRepository } from './payables.repository.js';
import { PayablesService } from './payables.service.js';

@Module({
  imports: [SuppliersModule, PurchaseOrdersModule],
  controllers: [PayablesController],
  providers: [PayablesService, PayablesRepository, StorageClient, ExtractionClient],
})
export class PayablesModule {}

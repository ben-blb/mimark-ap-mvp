import { Module } from '@nestjs/common';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { ClosingModule } from '../closing/closing.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [ClosingModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, StorageClient, SpreadsheetClient],
})
export class ReportsModule {}

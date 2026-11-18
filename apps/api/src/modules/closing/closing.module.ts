import { Module } from '@nestjs/common';
import { ClosingConfirmService } from './closing-confirm.service.js';
import { ClosingEntriesController } from './closing-entries.controller.js';
import { ClosingEntriesService } from './closing-entries.service.js';
import { ClosingUploadsController } from './closing-uploads.controller.js';
import { ClosingUploadsRepository } from './closing-uploads.repository.js';
import { ClosingUploadsService } from './closing-uploads.service.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { ClosingController } from './closing.controller.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingService } from './closing.service.js';

@Module({
  controllers: [ClosingController, ClosingUploadsController, ClosingEntriesController],
  providers: [
    ClosingService,
    ClosingRepository,
    ClosingUploadsService,
    ClosingConfirmService,
    ClosingEntriesService,
    ClosingUploadsRepository,
    SpreadsheetClient,
    StorageClient,
  ],
  // Las specs 021 a 024 leen el catálogo a través del repositorio (nunca escriben).
  exports: [ClosingRepository, ClosingUploadsRepository],
})
export class ClosingModule {}

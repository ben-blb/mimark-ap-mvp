import { Module } from '@nestjs/common';
import { ClosingBankPdfService } from './closing-bank-pdf.service.js';
import { ClosingConfirmService } from './closing-confirm.service.js';
import { ClosingEntriesController } from './closing-entries.controller.js';
import { ClosingEntriesService } from './closing-entries.service.js';
import { ClosingReviewController } from './closing-review.controller.js';
import { ClosingReviewService } from './closing-review.service.js';
import { ClosingTransfersController } from './closing-transfers.controller.js';
import { ClosingTransfersService } from './closing-transfers.service.js';
import { ClosingUploadsController } from './closing-uploads.controller.js';
import { ClosingUploadsRepository } from './closing-uploads.repository.js';
import { ClosingUploadsService } from './closing-uploads.service.js';
import { BankExtractionClient } from '../../integrations/bank-extraction.client.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { ClosingController } from './closing.controller.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingService } from './closing.service.js';

@Module({
  controllers: [
    ClosingController,
    ClosingUploadsController,
    ClosingEntriesController,
    ClosingReviewController,
    ClosingTransfersController,
  ],
  providers: [
    ClosingService,
    ClosingRepository,
    ClosingUploadsService,
    ClosingBankPdfService,
    ClosingConfirmService,
    ClosingEntriesService,
    ClosingReviewService,
    ClosingTransfersService,
    ClosingUploadsRepository,
    SpreadsheetClient,
    BankExtractionClient,
    StorageClient,
  ],
  // Las specs 021 a 024 leen el catálogo a través del repositorio (nunca escriben).
  exports: [ClosingRepository, ClosingUploadsRepository],
})
export class ClosingModule {}

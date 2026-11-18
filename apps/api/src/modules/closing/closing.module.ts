import { Module } from '@nestjs/common';
import { ClosingController } from './closing.controller.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingService } from './closing.service.js';

@Module({
  controllers: [ClosingController],
  providers: [ClosingService, ClosingRepository],
  // Las specs 021 a 024 leen el catálogo a través del repositorio (nunca escriben).
  exports: [ClosingRepository],
})
export class ClosingModule {}

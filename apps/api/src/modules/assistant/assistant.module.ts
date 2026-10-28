import { Module } from '@nestjs/common';
import { AssistantClient } from '../../integrations/assistant.client.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantClient],
})
export class AssistantModule {}

import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { SessionController } from './session.controller.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [UsersModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}

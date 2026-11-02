import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, SetupController],
  providers: [UsersService, SetupService, UsersRepository],
  // El módulo session lee usuarios con el repositorio para autenticar (nunca escribe el alta).
  exports: [UsersRepository],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller.js';
import { SuppliersRepository } from './suppliers.repository.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersRepository],
  // Otros módulos pueden leer proveedores a través del repositorio (nunca escribir).
  exports: [SuppliersRepository],
})
export class SuppliersModule {}

import { Controller, Get } from '@nestjs/common';
import { Public } from '../session/session.guard.js';
import { type HealthDto, HealthService } from './health.service.js';

/** Verificación de despliegue: pública, sin datos sensibles. */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): Promise<HealthDto> {
    return this.health.check();
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { type DashboardDto, DashboardQuery } from '@mimark/contracts/dashboard';
import { DashboardService } from './dashboard.service.js';
import { Requires } from '../session/session.guard.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Requires('dashboard:read')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query({ schema: DashboardQuery }) query: DashboardQuery): Promise<DashboardDto> {
    return this.dashboard.get(query);
  }
}

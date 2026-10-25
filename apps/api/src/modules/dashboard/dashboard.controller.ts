import { Controller, Get, Query } from '@nestjs/common';
import { type DashboardDto, DashboardQuery } from '@mimark/contracts/dashboard';
import { DashboardService } from './dashboard.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query({ schema: DashboardQuery }) query: DashboardQuery): Promise<DashboardDto> {
    return this.dashboard.get(query);
  }
}

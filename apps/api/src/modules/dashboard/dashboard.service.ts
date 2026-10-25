import { Injectable } from '@nestjs/common';
import type { DashboardDto, DashboardQuery } from '@mimark/contracts/dashboard';
import { toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import { DashboardRepository } from './dashboard.repository.js';
import { summarizePortfolio } from './dashboard.rules.js';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboard: DashboardRepository) {}

  async get(query: DashboardQuery): Promise<DashboardDto> {
    // "Hoy" es el de la zona del negocio: a las 8 pm en Monterrey ya es mañana en UTC.
    const today = toLocalDate(new Date(), env.BUSINESS_TZ);
    const { rows, inReview } = await this.dashboard.portfolio(`${today.slice(0, 7)}-01`);
    return summarizePortfolio(rows, today, query.horizon, inReview);
  }
}

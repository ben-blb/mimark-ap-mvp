import { Injectable } from '@nestjs/common';
import type { LocalDate } from '@mimark/contracts/common';
import { Db } from '../../common/db.js';
import { fromDbDate, toDbDate } from '../../common/dates.js';
import { moneyToCents } from '../../common/money.js';

/** Solo lo que el tablero necesita de cada expediente. Lee la tabla de expedientes; nunca la escribe. */
export interface PortfolioRowData {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  totalCents: number;
  currency: 'MXN' | 'USD';
  status: 'confirmed' | 'scheduled' | 'paid';
  dueOn: LocalDate;
  suggestedPayOn: LocalDate;
  scheduledPayOn: LocalDate | null;
  urgent: boolean;
  paidOn: LocalDate | null;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly db: Db) {}

  /** Lo que sigue por pagar y lo pagado desde `monthStart`, más cuántos están en revisión. */
  async portfolio(monthStart: LocalDate): Promise<{ rows: PortfolioRowData[]; inReview: number }> {
    const [found, inReview] = await Promise.all([
      this.db.payable.findMany({
        where: {
          OR: [
            { status: { in: ['confirmed', 'scheduled'] } },
            { status: 'paid', paidOn: { gte: toDbDate(monthStart) } },
          ],
        },
        select: {
          id: true,
          supplierName: true,
          invoiceNumber: true,
          total: true,
          currency: true,
          status: true,
          dueOn: true,
          suggestedPayOn: true,
          scheduledPayOn: true,
          urgent: true,
          paidOn: true,
        },
      }),
      this.db.payable.count({
        where: { status: { in: ['requires_review', 'pending_confirmation'] } },
      }),
    ]);

    const rows = found.flatMap((r): PortfolioRowData[] => {
      // Un confirmado, programado o pagado siempre tiene estos datos (los llena al confirmar).
      if (!r.total || !r.currency || !r.dueOn || !r.suggestedPayOn) return [];
      if (r.status !== 'confirmed' && r.status !== 'scheduled' && r.status !== 'paid') return [];
      return [
        {
          id: r.id,
          supplierName: r.supplierName ?? '',
          invoiceNumber: r.invoiceNumber ?? '',
          totalCents: moneyToCents(r.total.toFixed(2)),
          currency: r.currency,
          status: r.status,
          dueOn: fromDbDate(r.dueOn),
          suggestedPayOn: fromDbDate(r.suggestedPayOn),
          scheduledPayOn: r.scheduledPayOn ? fromDbDate(r.scheduledPayOn) : null,
          urgent: r.urgent,
          paidOn: r.paidOn ? fromDbDate(r.paidOn) : null,
        },
      ];
    });
    return { rows, inReview };
  }
}

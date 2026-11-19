import type { PeriodDto } from '@mimark/contracts/closing-review';
import type { ReportPeriod } from '../../generated/prisma/client.js';

export const toPeriodDto = (p: ReportPeriod): PeriodDto => ({
  id: p.id,
  companyId: p.companyId,
  month: p.month,
  status: p.status,
  closedBy: p.closedBy,
  closedAt: p.closedAt?.toISOString() ?? null,
  reopenReason: p.reopenReason,
});

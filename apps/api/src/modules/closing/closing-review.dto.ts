import type { PeriodDto } from '@mimark/contracts/closing-review';
import { fromDbDate } from '../../common/dates.js';
import type { TransferEntry } from './closing-checks.rules.js';
import type { EntryWithCategory } from './closing-uploads.repository.js';
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

/** El movimiento tal como lo ve la regla de traspasos. */
export const toTransferEntry = (e: EntryWithCategory): TransferEntry => ({
  id: e.id,
  date: fromDbDate(e.date),
  source: e.source,
  accountId: e.accountId,
  amountCents: Math.round(Number(e.amount) * 100),
  rowNumber: e.rowNumber,
});

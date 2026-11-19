import type { DrillEntryDto } from '@mimark/contracts/reports';
import { centsToMoney } from '../../common/money.js';
import { fromDbDate } from '../../common/dates.js';
import { signedMoneyToCents } from '../closing/closing-checks.rules.js';
import type { ReportEntryRow } from './reports.repository.js';
import type { ReportEntry } from './reports.rules.js';

/** Un movimiento con lo que las reglas necesitan y lo que el detalle muestra. */
export interface DetailedEntry extends ReportEntry {
  kioskName: string | null;
  accountId: string | null;
  accountName: string | null;
  uploadId: string | null;
  fileName: string | null;
}

export function toReportEntry(row: ReportEntryRow): DetailedEntry {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    date: fromDbDate(row.date),
    source: row.source,
    kind: row.kind,
    categoryId: row.categoryId,
    needsReview: row.needsReview,
    kioskId: row.kioskId,
    kioskName: row.kiosk?.name ?? null,
    accountId: row.accountId,
    accountName: row.account?.name ?? null,
    uploadId: row.uploadId,
    fileName: row.upload?.fileName ?? null,
    concept: row.concept,
    cents: signedMoneyToCents(row.amount.toFixed(2)),
  };
}

export function toDrillEntry(
  e: DetailedEntry & { amountCents: number; categoryCode: string | null },
): DrillEntryDto {
  return {
    id: e.id,
    date: e.date,
    concept: e.concept,
    kioskId: e.kioskId,
    kioskName: e.kioskName,
    accountId: e.accountId,
    accountName: e.accountName,
    categoryCode: e.categoryCode,
    amount: centsToMoney(e.amountCents),
    uploadId: e.uploadId,
    fileName: e.fileName,
    rowNumber: e.rowNumber,
  };
}

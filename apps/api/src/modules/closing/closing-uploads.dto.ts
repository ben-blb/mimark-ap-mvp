import type { LedgerEntryDto, Source, UploadDto } from '@mimark/contracts/closing-uploads';
import type { EntryRow, UploadRow } from './closing-uploads.repository.js';

/** Filas de Prisma → DTOs de contracts (spec 021). */
export const toUploadDto = (u: UploadRow): UploadDto => ({
  id: u.id,
  companyId: u.period.companyId,
  month: u.period.month,
  source: u.source,
  accountId: u.accountId,
  fileName: u.fileName,
  status: u.status,
  uploadedBy: u.uploadedBy,
  rowsRead: u.rowsRead,
  rowsRejected: u.rowsRejected,
  entriesCount: u.entriesCount,
  createdAt: u.createdAt.toISOString(),
});

export const toEntryDto = (e: EntryRow): LedgerEntryDto => ({
  id: e.id,
  companyId: e.period.companyId,
  month: e.period.month,
  date: e.date.toISOString().slice(0, 10),
  kioskId: e.kioskId,
  accountId: e.accountId,
  source: e.source satisfies Source,
  uploadId: e.uploadId,
  rowNumber: e.rowNumber,
  concept: e.concept,
  amount: e.amount.toFixed(2),
  categoryId: e.categoryId,
  kind: e.kind,
  needsReview: e.needsReview,
  meta: (e.meta as Record<string, unknown> | null) ?? null,
});

import { Injectable } from '@nestjs/common';
import type { Source, UploadStatus } from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import { Db, type Tx } from '../../common/db.js';
import type { Prisma, ReportPeriod } from '../../generated/prisma/client.js';

export type UploadRow = Prisma.SourceUploadGetPayload<{ include: { period: true } }>;
export type EntryRow = Prisma.LedgerEntryGetPayload<{ include: { period: true } }>;

export interface NewEntry {
  periodId: string;
  date: Date;
  kioskId: string | null;
  accountId: string | null;
  source: Source;
  uploadId: string | null;
  rowNumber: number | null;
  concept: string;
  amount: string;
  needsReview: boolean;
  meta?: Prisma.InputJsonValue;
  createdBy: string;
}

/**
 * Única puerta a los periodos, las cargas y los movimientos del cierre (spec 021). Solo el módulo closing escribe en
 * estas tablas; las specs 023 y 024 las leen.
 */
@Injectable()
export class ClosingUploadsRepository {
  constructor(private readonly db: Db) {}

  // Periodos
  findPeriod(companyId: string, month: string, tx: Tx = this.db): Promise<ReportPeriod | null> {
    return tx.reportPeriod.findUnique({ where: { companyId_month: { companyId, month } } });
  }

  /** El periodo se crea con la primera carga o movimiento del mes. */
  ensurePeriod(companyId: string, month: string, tx: Tx = this.db): Promise<ReportPeriod> {
    return tx.reportPeriod.upsert({
      where: { companyId_month: { companyId, month } },
      create: { companyId, month },
      update: {},
    });
  }

  // Cargas
  findUpload(id: string, tx: Tx = this.db): Promise<UploadRow | null> {
    return tx.sourceUpload.findUnique({ where: { id }, include: { period: true } });
  }

  listUploads(companyId: string, month: string): Promise<UploadRow[]> {
    return this.db.sourceUpload.findMany({
      where: { period: { companyId, month } },
      include: { period: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** La carga confirmada vigente de esa fuente (y cuenta) en el periodo, si hay. */
  findConfirmed(
    periodId: string,
    source: Source,
    accountId: string | null,
    tx: Tx = this.db,
  ): Promise<UploadRow | null> {
    return tx.sourceUpload.findFirst({
      where: { periodId, source, accountId, status: 'confirmed' },
      include: { period: true },
    });
  }

  createUpload(
    data: Omit<Prisma.SourceUploadUncheckedCreateInput, 'id' | 'status' | 'entriesCount'>,
    tx: Tx = this.db,
  ): Promise<UploadRow> {
    return tx.sourceUpload.create({ data, include: { period: true } });
  }

  /** Cambia el estado solo si sigue en uno de `from`; si no, otra persona ya lo movió. */
  async moveUploadStatus(
    id: string,
    from: UploadStatus[],
    to: UploadStatus,
    tx: Tx,
    extra: { entriesCount?: number } = {},
  ): Promise<void> {
    const { count } = await tx.sourceUpload.updateMany({
      where: { id, status: { in: from } },
      data: { status: to, ...extra },
    });
    if (count !== 1) {
      throw new AppError(
        'INVALID_TRANSITION',
        'Esta carga ya cambió de estado. Recarga la pantalla.',
      );
    }
  }

  // Movimientos
  async replaceEntries(uploadIdToClear: string | null, entries: NewEntry[], tx: Tx): Promise<void> {
    if (uploadIdToClear) await tx.ledgerEntry.deleteMany({ where: { uploadId: uploadIdToClear } });
    await tx.ledgerEntry.createMany({ data: entries });
  }

  createEntry(data: NewEntry, tx: Tx = this.db): Promise<EntryRow> {
    return tx.ledgerEntry.create({ data, include: { period: true } });
  }

  async listEntries(
    filter: { companyId: string; month: string; source?: Source; kioskId?: string },
    page: number,
    pageSize: number,
  ): Promise<{ items: EntryRow[]; total: number }> {
    const where: Prisma.LedgerEntryWhereInput = {
      period: { companyId: filter.companyId, month: filter.month },
      source: filter.source,
      kioskId: filter.kioskId,
    };
    const [items, total] = await Promise.all([
      this.db.ledgerEntry.findMany({
        where,
        include: { period: true },
        orderBy: [{ date: 'asc' }, { source: 'asc' }, { rowNumber: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.ledgerEntry.count({ where }),
    ]);
    return { items, total };
  }
}

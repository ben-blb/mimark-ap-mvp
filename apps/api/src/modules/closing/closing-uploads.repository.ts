import { Injectable } from '@nestjs/common';
import type { Source, UploadStatus } from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import { Db, type Tx } from '../../common/db.js';
import type { Prisma, ReportPeriod } from '../../generated/prisma/client.js';

const BANK_SOURCES: Source[] = ['bank_csv', 'bank_pdf'];

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

  /** Bloquea el periodo hasta el fin de la transacción: confirmar dos cargas del mismo hueco no se cruza. */
  async lockPeriod(periodId: string, tx: Tx): Promise<ReportPeriod> {
    await tx.$queryRaw`SELECT id FROM "ReportPeriod" WHERE id = ${periodId} FOR UPDATE`;
    return tx.reportPeriod.findUniqueOrThrow({ where: { id: periodId } });
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

  /**
   * La carga confirmada vigente de esa fuente (y cuenta) en el periodo, si hay. El banco en CSV y en PDF son la misma
   * fuente para el cierre: confirmar uno reemplaza al otro, así los movimientos no se duplican (spec 022).
   */
  findConfirmed(
    periodId: string,
    source: Source,
    accountId: string | null,
    tx: Tx = this.db,
  ): Promise<UploadRow | null> {
    const sources = source === 'bank_csv' || source === 'bank_pdf' ? BANK_SOURCES : [source];
    return tx.sourceUpload.findFirst({
      where: { periodId, source: { in: sources }, accountId, status: 'confirmed' },
      include: { period: true },
    });
  }

  /** La carga fallida del mismo archivo (hash), para reintentar sin crear otra (AC-022-08). */
  findFailed(
    periodId: string,
    source: Source,
    accountId: string | null,
    sha256: string,
  ): Promise<UploadRow | null> {
    return this.db.sourceUpload.findFirst({
      where: { periodId, source, accountId, sha256, status: 'failed' },
      include: { period: true },
    });
  }

  /** Una carga en vista previa con ese mismo archivo: reenviarlo devuelve esa carga en vez de crear otra. */
  findPreviewed(
    periodId: string,
    source: Source,
    accountId: string | null,
    sha256: string,
  ): Promise<UploadRow | null> {
    return this.db.sourceUpload.findFirst({
      where: { periodId, source, accountId, sha256, status: 'previewed' },
      include: { period: true },
    });
  }

  /** El borrador del estado de cuenta confirmado de esa cuenta en un mes (para comparar saldos, AC-022-05). */
  async findConfirmedBankDraft(
    companyId: string,
    month: string,
    accountId: string,
  ): Promise<Prisma.JsonValue | null> {
    const row = await this.db.sourceUpload.findFirst({
      where: { source: 'bank_pdf', accountId, status: 'confirmed', period: { companyId, month } },
      select: { draft: true },
    });
    return row?.draft ?? null;
  }

  createUpload(
    data: Omit<Prisma.SourceUploadUncheckedCreateInput, 'id' | 'entriesCount'>,
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

  /** Guarda el borrador (y los contadores) solo si la carga sigue en uno de `from`. */
  async saveBankDraft(
    id: string,
    from: UploadStatus[],
    data: {
      draft: Prisma.InputJsonValue;
      rowsRead: number;
      rowsRejected: number;
      status?: UploadStatus;
      meta?: Prisma.InputJsonValue;
    },
    tx: Tx,
  ): Promise<void> {
    const { count } = await tx.sourceUpload.updateMany({
      where: { id, status: { in: from } },
      data,
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

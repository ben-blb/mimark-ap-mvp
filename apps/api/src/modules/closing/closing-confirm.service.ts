import { Injectable } from '@nestjs/common';
import type { UploadDto } from '@mimark/contracts/closing-uploads';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingUploadsRepository, type NewEntry } from './closing-uploads.repository.js';
import { toUploadDto } from './closing-uploads.dto.js';
import { detectSheetType } from './source-file.rules.js';
import { analyzeSheet, buildKioskLookup } from './source-parsers.rules.js';

/**
 * Confirmar una carga (spec 021): crea los movimientos y, si ya había una carga confirmada de esa fuente en el mes,
 * la reemplaza. Se vuelve a leer el original guardado, así la vista previa y lo confirmado salen del mismo archivo.
 */
@Injectable()
export class ClosingConfirmService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly uploads: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
    private readonly storage: StorageClient,
    private readonly sheets: SpreadsheetClient,
  ) {}

  async confirm(id: string, ctx: Ctx): Promise<UploadDto> {
    const upload = await this.uploads.findUpload(id);
    if (!upload) throw new AppError('NOT_FOUND', 'No existe esa carga.');
    if (upload.period.status === 'closed') throw new AppError('PERIOD_CLOSED');
    if (upload.status !== 'previewed') {
      throw new AppError('INVALID_TRANSITION', 'Esta carga ya no está en vista previa.');
    }

    if (upload.source === 'bank_pdf') throw new AppError('INVALID_TRANSITION', 'Pendiente (tarea 5).');
    const bytes = await this.storage.get(upload.fileKey);
    const kind = detectSheetType(bytes, upload.fileName);
    if (!kind)
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos .xlsx o .csv.');
    const kiosks = buildKioskLookup(await this.closing.listActiveKiosksOf(upload.period.companyId));
    const analysis = analyzeSheet(upload.source, await this.sheets.read(bytes, kind), {
      month: upload.period.month,
      kiosks,
    });
    const entries: NewEntry[] = analysis.entries.map(({ row, entry }) => ({
      periodId: upload.periodId,
      date: new Date(entry.date),
      kioskId: entry.kioskId,
      accountId: upload.accountId,
      source: upload.source,
      uploadId: upload.id,
      rowNumber: row,
      concept: entry.concept,
      amount: entry.amount,
      needsReview: entry.needsReview,
      // Solo texto, números y booleanos de las celdas leídas: es JSON válido.
      meta: (entry.meta as Prisma.InputJsonObject | null) ?? undefined,
      createdBy: ctx.actor,
    }));

    return this.db.$transaction(async (tx) => {
      const period = await this.uploads.lockPeriod(upload.periodId, tx);
      if (period.status === 'closed') throw new AppError('PERIOD_CLOSED');

      const previous = await this.uploads.findConfirmed(
        upload.periodId,
        upload.source,
        upload.accountId,
        tx,
      );
      if (previous?.sha256 === upload.sha256) {
        throw new AppError(
          'DUPLICATE_UPLOAD',
          `Este archivo ya lo confirmó ${previous.uploadedBy}.`,
          {
            details: { uploadedBy: previous.uploadedBy, at: previous.createdAt.toISOString() },
          },
        );
      }
      if (previous) {
        await this.uploads.moveUploadStatus(previous.id, ['confirmed'], 'superseded', tx);
        await this.audit.log(
          {
            ...ctx,
            entity: 'upload',
            entityId: previous.id,
            action: 'upload.superseded',
            fromStatus: 'confirmed',
            toStatus: 'superseded',
            data: { supersededBy: upload.id },
          },
          tx,
        );
      }

      await this.uploads.replaceEntries(previous?.id ?? null, entries, tx);
      await this.uploads.moveUploadStatus(upload.id, ['previewed'], 'confirmed', tx, {
        entriesCount: entries.length,
      });
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: upload.id,
          action: 'upload.confirmed',
          fromStatus: 'previewed',
          toStatus: 'confirmed',
          data: { entries: entries.length, replaced: previous?.id ?? null },
        },
        tx,
      );
      return toUploadDto({ ...upload, status: 'confirmed', entriesCount: entries.length });
    });
  }
}

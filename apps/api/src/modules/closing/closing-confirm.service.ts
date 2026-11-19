import { Injectable } from '@nestjs/common';
import {
  BankDraftData,
  type ConfirmUploadInput,
  type UploadDto,
} from '@mimark/contracts/closing-uploads';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { balanceCheck, toEntries } from './bank-statement.rules.js';
import { ClosingRepository } from './closing.repository.js';
import {
  ClosingUploadsRepository,
  type NewEntry,
  type UploadRow,
} from './closing-uploads.repository.js';
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

  async confirm(id: string, input: ConfirmUploadInput, ctx: Ctx): Promise<UploadDto> {
    const upload = await this.uploads.findUpload(id);
    if (!upload) throw new AppError('NOT_FOUND', 'No existe esa carga.');
    if (upload.period.status === 'closed') throw new AppError('PERIOD_CLOSED');
    if (upload.status !== 'previewed') {
      throw new AppError('INVALID_TRANSITION', 'Esta carga ya no está en vista previa.');
    }

    const sheet = upload.source === 'bank_pdf' ? null : await this.fromSheet(upload, ctx);

    return this.db.$transaction(async (tx) => {
      const period = await this.uploads.lockPeriod(upload.periodId, tx);
      if (period.status === 'closed') throw new AppError('PERIOD_CLOSED');

      // El borrador se lee ya con el periodo bloqueado: una edición concurrente espera el mismo candado.
      let fresh = upload;
      if (!sheet) {
        fresh = (await this.uploads.findUpload(id, tx)) ?? upload;
        if (fresh.status !== 'previewed') {
          throw new AppError('INVALID_TRANSITION', 'Esta carga ya no está en vista previa.');
        }
      }
      const { entries, difference, auditData } = sheet
        ? { ...sheet, difference: null, auditData: {} }
        : this.fromDraft(fresh, input, ctx);

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
          data: { entries: entries.length, replaced: previous?.id ?? null, ...auditData },
        },
        tx,
      );
      if (difference !== null) {
        await this.audit.log(
          {
            ...ctx,
            entity: 'upload',
            entityId: upload.id,
            action: 'upload.balance-accepted',
            data: { difference },
          },
          tx,
        );
      }
      return toUploadDto({ ...upload, status: 'confirmed', entriesCount: entries.length });
    });
  }

  /** Hoja de cálculo: se vuelve a leer el original guardado. */
  private async fromSheet(upload: UploadRow, ctx: Ctx): Promise<{ entries: NewEntry[] }> {
    const source = upload.source;
    if (source === 'bank_pdf') throw new AppError('INVALID_TRANSITION');
    const bytes = await this.storage.get(upload.fileKey);
    const kind = detectSheetType(bytes, upload.fileName);
    if (!kind)
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos .xlsx o .csv.');
    const kiosks = buildKioskLookup(await this.closing.listActiveKiosksOf(upload.period.companyId));
    const analysis = analyzeSheet(source, await this.sheets.read(bytes, kind), {
      month: upload.period.month,
      kiosks,
    });
    return {
      entries: analysis.entries.map(({ row, entry }) => ({
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
      })),
    };
  }

  /**
   * Estado de cuenta en PDF (spec 022): los movimientos salen del borrador que la persona revisó. Si los saldos no
   * cuadran solo se confirma aceptando la diferencia de forma explícita.
   */
  private fromDraft(
    upload: UploadRow,
    input: ConfirmUploadInput,
    ctx: Ctx,
  ): {
    entries: NewEntry[];
    difference: string | null;
    auditData: Record<string, string | number | null>;
  } {
    const draft = BankDraftData.parse(upload.draft);
    const check = balanceCheck(draft);
    if (!check.ok && !input.acceptDifference) {
      throw new AppError(
        'REVIEW_REQUIRED',
        `Los saldos no cuadran (diferencia ${check.difference}). Corrige las filas o acepta la diferencia.`,
        { details: { difference: check.difference } },
      );
    }
    const meta = (upload.meta ?? {}) as Record<string, unknown>;
    return {
      entries: toEntries(draft, upload.period.month).map((e) => ({
        periodId: upload.periodId,
        date: new Date(e.date),
        kioskId: null,
        accountId: upload.accountId,
        source: upload.source,
        uploadId: upload.id,
        rowNumber: e.row,
        concept: e.concept,
        amount: e.amount,
        needsReview: e.needsReview,
        meta: e.meta,
        createdBy: ctx.actor,
      })),
      difference: check.ok ? null : check.difference,
      auditData: {
        model: (meta.model as string | undefined) ?? null,
        promptVersion: (meta.promptVersion as string | undefined) ?? null,
        ms: (meta.ms as number | undefined) ?? null,
      },
    };
  }
}

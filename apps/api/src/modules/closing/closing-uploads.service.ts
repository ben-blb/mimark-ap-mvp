import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  UploadDto,
  UploadInput,
  UploadList,
  UploadListQuery,
  UploadPreviewDto,
} from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { decodeFileName } from '../payables/file.rules.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingUploadsRepository } from './closing-uploads.repository.js';
import { toUploadDto } from './closing-uploads.dto.js';
import { detectSheetType, type SheetKind } from './source-file.rules.js';
import { analyzeSheet, buildKioskLookup, summarizeSheet } from './source-parsers.rules.js';

const MIME: Record<SheetKind, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

/**
 * Carga de fuentes del mes (spec 021): sube el archivo, lo valida y muestra la vista previa. Los movimientos se crean
 * hasta confirmar (`closing-confirm.service.ts`). El contenido del archivo nunca se registra: solo contadores.
 */
@Injectable()
export class ClosingUploadsService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly uploads: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
    private readonly storage: StorageClient,
    private readonly sheets: SpreadsheetClient,
  ) {}

  async upload(
    file: { buffer: Buffer; originalname: string },
    input: UploadInput,
    ctx: Ctx,
  ): Promise<UploadPreviewDto> {
    const fileName = decodeFileName(file.originalname);
    const kind = detectSheetType(file.buffer, fileName);
    if (!kind)
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos .xlsx o .csv.');

    const accountId = await this.requireTarget(input);
    const period = await this.uploads.findPeriod(input.companyId, input.month);
    if (period?.status === 'closed') throw new AppError('PERIOD_CLOSED');

    const kiosks = buildKioskLookup(await this.closing.listActiveKiosksOf(input.companyId));
    const rows = await this.sheets.read(file.buffer, kind);
    const analysis = analyzeSheet(input.source, rows, { month: input.month, kiosks });

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    if (period) await this.requireNotDuplicate(period.id, input.source, accountId, sha256);

    const fileKey = await this.storage.put(file.buffer, MIME[kind], 'closing');
    const summary = summarizeSheet(analysis);
    const upload = await this.db.$transaction(async (tx) => {
      const ensured = await this.uploads.ensurePeriod(input.companyId, input.month, tx);
      const created = await this.uploads.createUpload(
        {
          periodId: ensured.id,
          source: input.source,
          accountId,
          fileKey,
          fileName,
          sha256,
          uploadedBy: ctx.actor,
          rowsRead: summary.rowsRead,
          rowsRejected: summary.rowsRejected,
        },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: created.id,
          action: 'upload.previewed',
          toStatus: 'previewed',
          data: {
            source: input.source,
            month: input.month,
            fileName,
            rowsRead: summary.rowsRead,
            rowsRejected: summary.rowsRejected,
          },
        },
        tx,
      );
      return created;
    });
    return { upload: toUploadDto(upload), ...summary };
  }

  async list(query: UploadListQuery): Promise<UploadList> {
    const rows = await this.uploads.listUploads(query.companyId, query.month);
    return { items: rows.map(toUploadDto) };
  }

  discard(id: string, ctx: Ctx): Promise<UploadDto> {
    return this.db.$transaction(async (tx) => {
      const upload = await this.uploads.findUpload(id, tx);
      if (!upload) throw new AppError('NOT_FOUND', 'No existe esa carga.');
      if (upload.period.status === 'closed') throw new AppError('PERIOD_CLOSED');
      await this.uploads.moveUploadStatus(id, ['previewed'], 'discarded', tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: id,
          action: 'upload.discarded',
          fromStatus: 'previewed',
          toStatus: 'discarded',
        },
        tx,
      );
      return toUploadDto({ ...upload, status: 'discarded' });
    });
  }

  /** La empresa existe y, en el banco, la cuenta es de esa empresa. Devuelve la cuenta que se guarda. */
  private async requireTarget(input: UploadInput): Promise<string | null> {
    if (!(await this.closing.findCompany(input.companyId))) {
      throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    }
    if (input.source !== 'bank_csv') return null;
    const account = input.accountId ? await this.closing.findAccount(input.accountId) : null;
    const message = !input.accountId
      ? 'Elige la cuenta del banco'
      : 'La cuenta no es de esta empresa';
    if (!account || account.companyId !== input.companyId) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { accountId: message } });
    }
    return account.id;
  }

  private async requireNotDuplicate(
    periodId: string,
    source: UploadInput['source'],
    accountId: string | null,
    sha256: string,
  ): Promise<void> {
    const confirmed = await this.uploads.findConfirmed(periodId, source, accountId);
    if (confirmed?.sha256 !== sha256) return;
    const at = confirmed.createdAt.toISOString();
    throw new AppError(
      'DUPLICATE_UPLOAD',
      `Este archivo ya lo cargó ${confirmed.uploadedBy} el ${at.slice(0, 10)}.`,
      { details: { uploadedBy: confirmed.uploadedBy, at } },
    );
  }
}

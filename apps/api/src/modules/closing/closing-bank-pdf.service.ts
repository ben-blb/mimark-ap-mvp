import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  BankDraftData,
  type BankPdfInput,
  type BankStatementDraft,
  type UpdateBankDraftInput,
} from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { startOfLocalDay, toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BankExtractionClient } from '../../integrations/bank-extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { checkQuota, decodeFileName, detectFileType } from '../payables/file.rules.js';
import {
  applyEdits,
  balanceCheck,
  buildDraft,
  countRows,
  openingMismatch,
  previousMonth,
  withFlags,
} from './bank-statement.rules.js';
import { ClosingRepository } from './closing.repository.js';
import { toUploadDto } from './closing-uploads.dto.js';
import { ClosingUploadsRepository, type UploadRow } from './closing-uploads.repository.js';

const QUOTA_ACTION = 'upload.bank-pdf-extracted';

/**
 * Estado de cuenta en PDF (spec 022): sube el original, la IA propone las filas y la persona las revisa y edita
 * antes de confirmar (`closing-confirm.service.ts`). El contenido del PDF nunca se registra: solo contadores.
 */
@Injectable()
export class ClosingBankPdfService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly uploads: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
    private readonly storage: StorageClient,
    private readonly extractor: BankExtractionClient,
  ) {}

  async upload(
    file: { buffer: Buffer; originalname: string },
    input: BankPdfInput,
    ctx: Ctx,
  ): Promise<BankStatementDraft> {
    const fileName = decodeFileName(file.originalname);
    if (detectFileType(file.buffer) !== 'application/pdf') {
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos PDF.');
    }
    const accountId = await this.requireAccount(input);
    const period = await this.uploads.findPeriod(input.companyId, input.month);
    if (period?.status === 'closed') throw new AppError('PERIOD_CLOSED');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    if (period) {
      const confirmed = await this.uploads.findConfirmed(period.id, 'bank_pdf', accountId);
      if (confirmed?.sha256 === sha256) {
        const at = confirmed.createdAt.toISOString();
        throw new AppError(
          'DUPLICATE_UPLOAD',
          `Este archivo ya lo cargó ${confirmed.uploadedBy} el ${at.slice(0, 10)}.`,
          { details: { uploadedBy: confirmed.uploadedBy, at } },
        );
      }
    }
    await this.checkQuota(ctx.actor);

    // Reintento: el mismo PDF que ya falló reutiliza su carga y su original.
    const failed = period
      ? await this.uploads.findFailed(period.id, 'bank_pdf', accountId, sha256)
      : null;
    const fileKey =
      failed?.fileKey ?? (await this.storage.put(file.buffer, 'application/pdf', 'closing'));

    let extraction;
    try {
      extraction = await this.extractor.extract({ bytes: file.buffer, fileName });
    } catch {
      return this.fail(
        'El modelo no respondió',
        { input, accountId, fileKey, fileName, sha256, failed },
        ctx,
      );
    }
    const draft = buildDraft(extraction.data);
    const counts = countRows(draft, input.month);
    if (counts.read - counts.rejected === 0) {
      return this.fail(
        'Sin movimientos del mes',
        { input, accountId, fileKey, fileName, sha256, failed },
        ctx,
      );
    }

    const meta = {
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      ms: extraction.ms,
      // Salida de la IA ya enmascarada, tal como se propuso: las ediciones solo tocan `draft`.
      extraction: draft,
    };
    const saved = await this.db.$transaction(async (tx) => {
      const ensured = await this.uploads.ensurePeriod(input.companyId, input.month, tx);
      const data = {
        draft: draft as unknown as Prisma.InputJsonValue,
        meta: meta as unknown as Prisma.InputJsonValue,
        rowsRead: counts.read,
        rowsRejected: counts.rejected,
      };
      let id: string;
      if (failed) {
        await this.uploads.saveBankDraft(
          failed.id,
          ['failed'],
          { ...data, status: 'previewed' },
          tx,
        );
        id = failed.id;
      } else {
        id = (
          await this.uploads.createUpload(
            {
              periodId: ensured.id,
              source: 'bank_pdf',
              accountId,
              fileKey,
              fileName,
              sha256,
              uploadedBy: ctx.actor,
              ...data,
            },
            tx,
          )
        ).id;
      }
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: id,
          action: QUOTA_ACTION,
          toStatus: 'previewed',
          data: {
            month: input.month,
            fileName,
            model: meta.model,
            promptVersion: meta.promptVersion,
            ms: meta.ms,
            rows: counts.read,
          },
        },
        tx,
      );
      return (await this.uploads.findUpload(id, tx))!;
    });
    return this.view(saved, draft);
  }

  /** Aplica ediciones a las filas del borrador y recalcula saldos y avisos (AC-022-06). */
  async editDraft(id: string, input: UpdateBankDraftInput, ctx: Ctx): Promise<BankStatementDraft> {
    const upload = await this.uploads.findUpload(id);
    if (!upload || upload.source !== 'bank_pdf')
      throw new AppError('NOT_FOUND', 'No existe ese borrador.');
    if (upload.period.status === 'closed') throw new AppError('PERIOD_CLOSED');
    if (upload.status !== 'previewed') {
      throw new AppError('CONFLICT', 'Este borrador ya no se puede editar.');
    }

    const { draft, fieldErrors } = applyEdits(BankDraftData.parse(upload.draft), input.rows);
    if (Object.keys(fieldErrors).length > 0)
      throw new AppError('VALIDATION', undefined, { fieldErrors });

    const counts = countRows(draft, upload.period.month);
    await this.db.$transaction(async (tx) => {
      await this.uploads.saveBankDraft(
        id,
        ['previewed'],
        {
          draft: draft as unknown as Prisma.InputJsonValue,
          rowsRead: counts.read,
          rowsRejected: counts.rejected,
        },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: id,
          action: 'upload.draft-edited',
          data: { rowsEdited: input.rows.length },
        },
        tx,
      );
    });
    return this.view({ ...upload, rowsRead: counts.read, rowsRejected: counts.rejected }, draft);
  }

  /** Deja la carga en `failed` (sin movimientos) y avisa que la IA no pudo leer el PDF (AC-022-08). */
  private async fail(
    reason: string,
    ctxData: {
      input: BankPdfInput;
      accountId: string;
      fileKey: string;
      fileName: string;
      sha256: string;
      failed: UploadRow | null;
    },
    ctx: Ctx,
  ): Promise<never> {
    const { input, accountId, fileKey, fileName, sha256, failed } = ctxData;
    await this.db.$transaction(async (tx) => {
      let id = failed?.id;
      if (!id) {
        const ensured = await this.uploads.ensurePeriod(input.companyId, input.month, tx);
        const created = await this.uploads.createUpload(
          {
            periodId: ensured.id,
            source: 'bank_pdf',
            accountId,
            fileKey,
            fileName,
            sha256,
            status: 'failed',
            uploadedBy: ctx.actor,
            rowsRead: 0,
            rowsRejected: 0,
          },
          tx,
        );
        id = created.id;
      }
      await this.audit.log(
        {
          ...ctx,
          entity: 'upload',
          entityId: id,
          action: 'upload.bank-pdf-failed',
          toStatus: 'failed',
          data: { month: input.month, fileName, reason },
        },
        tx,
      );
    });
    throw new AppError('AI_UNAVAILABLE');
  }

  private async view(upload: UploadRow, draft: BankDraftData): Promise<BankStatementDraft> {
    const previous = upload.accountId
      ? await this.uploads.findConfirmedBankDraft(
          upload.period.companyId,
          previousMonth(upload.period.month),
          upload.accountId,
        )
      : null;
    const previousClosing = previous ? BankDraftData.parse(previous).closingBalance : null;
    return {
      upload: toUploadDto(upload),
      openingBalance: draft.openingBalance,
      closingBalance: draft.closingBalance,
      rows: withFlags(draft, upload.period.month),
      balanceCheck: balanceCheck(draft),
      warnings: openingMismatch(draft.openingBalance, previousClosing)
        ? ['OPENING_BALANCE_MISMATCH']
        : [],
    };
  }

  /** La empresa existe y la cuenta es de esa empresa (como AC-021-07). */
  private async requireAccount(input: BankPdfInput): Promise<string> {
    if (!(await this.closing.findCompany(input.companyId))) {
      throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    }
    const account = input.accountId ? await this.closing.findAccount(input.accountId) : null;
    if (!account || account.companyId !== input.companyId) {
      const message = !input.accountId
        ? 'Elige la cuenta del banco'
        : 'La cuenta no es de esta empresa';
      throw new AppError('VALIDATION', undefined, { fieldErrors: { accountId: message } });
    }
    return account.id;
  }

  /** Solo cuentan las extracciones que salieron bien: un reintento tras un fallo no cobra dos veces. */
  private async checkQuota(actor: string): Promise<void> {
    const since = startOfLocalDay(toLocalDate(new Date(), env.BUSINESS_TZ), env.BUSINESS_TZ);
    const [byActor, total] = await Promise.all([
      this.audit.countSince({ action: QUOTA_ACTION, actor, since }),
      this.audit.countSince({ action: QUOTA_ACTION, since }),
    ]);
    checkQuota(
      { actor: byActor, total },
      { actor: env.DAILY_AI_LIMIT, total: env.DAILY_AI_LIMIT_GLOBAL },
    );
  }
}

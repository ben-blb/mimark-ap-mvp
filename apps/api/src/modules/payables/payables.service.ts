import { Injectable } from '@nestjs/common';
import { LocalDate } from '@mimark/contracts/common';
import type {
  PayableDto,
  PayableHistory,
  PayableList,
  PayableListQuery,
  UploadPayableInput,
} from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, type Tx } from '../../common/db.js';
import { startOfLocalDay, toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import { ExtractionClient, type ExtractionResult } from '../../integrations/extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { checkQuota, checkReceivedOn, decodeFileName, detectFileType } from './file.rules.js';
import { PayableContextLoader } from './payables.context.js';
import { toEvaluation, toPayableDto, toPayableSummary } from './payables.dto.js';
import { PayablesRepository, type PayableRow } from './payables.repository.js';
import { canRetry, RETRY_AFTER_MS } from './payables.state.rules.js';
import { evaluatePayable, normalizeExtraction } from './payables.rules.js';

const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe ese expediente.');

type Entity = Ctx & { entity: string; entityId: string };

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

@Injectable()
export class PayablesService {
  constructor(
    private readonly db: Db,
    private readonly payables: PayablesRepository,
    private readonly context: PayableContextLoader,
    private readonly audit: AuditRepository,
    private readonly storage: StorageClient,
    private readonly extraction: ExtractionClient,
  ) {}

  async list(query: PayableListQuery): Promise<PayableList> {
    const rows = await this.payables.list(query, this.today());
    return {
      items: rows.map(toPayableSummary),
    };
  }

  async get(id: string): Promise<PayableDto> {
    return toPayableDto(await this.find(id), this.today());
  }

  async file(id: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    const row = await this.find(id);
    return {
      bytes: await this.storage.get(row.fileKey),
      mimeType: row.mimeType,
      fileName: row.fileName,
    };
  }

  async history(id: string): Promise<PayableHistory> {
    await this.find(id);
    const events = await this.audit.listFor('payable', id);
    return {
      items: events.map((e) => ({
        at: e.at.toISOString(),
        actor: e.actor,
        action: e.action,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        data: e.data ?? null,
      })),
    };
  }

  async upload(file: UploadedFile, input: UploadPayableInput, ctx: Ctx): Promise<PayableDto> {
    const fileName = decodeFileName(file.originalname);
    const mimeType = detectFileType(file.buffer);
    if (!mimeType) throw new AppError('FILE_TYPE_NOT_ALLOWED');
    const today = this.today();
    const receivedOn = input.invoiceReceivedOn ?? today;
    checkReceivedOn(receivedOn, today);
    await this.checkQuota(ctx.actor);

    const fileKey = await this.storage.put(file.buffer, mimeType);
    const row = await this.db.$transaction(async (tx) => {
      const created = await this.payables.create(
        {
          createdBy: ctx.actor,
          fileKey,
          fileName,
          mimeType,
          fileSize: file.buffer.length,
          selectedPoNumber: input.purchaseOrderNumber ?? null,
          invoiceReceivedOn: receivedOn,
        },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'payable',
          entityId: created.id,
          action: 'payable.uploaded',
          toStatus: 'uploaded',
          data: { fileName, mimeType, fileSize: file.buffer.length },
        },
        tx,
      );
      return created;
    });

    return this.process(
      row,
      file.buffer,
      (tx) => this.payables.moveStatus(row.id, ['uploaded'], 'processing', tx),
      ctx,
    );
  }

  async retry(id: string, ctx: Ctx): Promise<PayableDto> {
    const row = await this.find(id);
    if (!canRetry(row.status, row.updatedAt, new Date())) {
      throw new AppError('INVALID_TRANSITION', 'Este expediente no se puede reintentar.');
    }
    await this.checkQuota(ctx.actor);
    const bytes = await this.storage.get(row.fileKey);
    const staleBefore = new Date(Date.now() - RETRY_AFTER_MS);
    return this.process(
      row,
      bytes,
      (tx) => this.payables.claimForRetry(row.id, staleBefore, tx),
      ctx,
    );
  }

  /** Pasos 6–11 del flujo: lo comparten la carga y el reintento. `claim` pasa el expediente a processing. */
  private async process(
    row: PayableRow,
    bytes: Buffer,
    claim: (tx: Tx) => Promise<void>,
    ctx: Ctx,
  ): Promise<PayableDto> {
    const entity = { ...ctx, entity: 'payable', entityId: row.id };
    await this.db.$transaction(async (tx) => {
      await claim(tx);
      await this.audit.log(
        { ...entity, action: 'payable.processing', fromStatus: row.status, toStatus: 'processing' },
        tx,
      );
    });

    let result;
    try {
      result = await this.extraction.extract({
        bytes,
        mimeType: row.mimeType,
        fileName: row.fileName,
      });
    } catch (error) {
      // Solo el tipo de error: el mensaje del proveedor podría traer contenido del documento.
      const errorName = error instanceof Error ? error.name : 'Error';
      await this.db.$transaction(async (tx) => {
        await this.audit.log(
          { ...entity, action: 'payable.extracted', data: { ok: false, error: errorName } },
          tx,
        );
        await this.payables.markFailed(row.id, 'AI_UNAVAILABLE', tx);
        await this.audit.log(
          {
            ...entity,
            action: 'payable.failed',
            fromStatus: 'processing',
            toStatus: 'failed',
            data: { failureCode: 'AI_UNAVAILABLE' },
          },
          tx,
        );
      });
      throw new AppError('AI_UNAVAILABLE', undefined, { details: { payableId: row.id } });
    }

    try {
      await this.evaluateAndSave(row, result, entity);
    } catch (error) {
      await this.failAfterExtraction(row.id, result, entity, error);
      throw error;
    }

    return this.get(row.id);
  }

  /** Pasos 8–11: normaliza, carga el contexto, decide y guarda todo en una transacción. */
  private async evaluateAndSave(
    row: PayableRow,
    result: ExtractionResult,
    entity: Entity,
  ): Promise<void> {
    const facts = normalizeExtraction(result.data);
    const { context, po, supplier } = await this.context.load({
      facts,
      selectedPoNumber: row.selectedPoNumber,
      excludeId: row.id,
    });
    const { status, reasons } = evaluatePayable(facts, context);

    await this.db.$transaction(async (tx) => {
      await this.payables.saveEvaluation(
        row.id,
        toEvaluation({ facts, status, reasons, result, po, supplier }),
        tx,
      );
      await this.audit.log(
        {
          ...entity,
          action: 'payable.extracted',
          data: {
            ok: true,
            model: result.model,
            promptVersion: result.promptVersion,
            ms: result.ms,
          },
        },
        tx,
      );
      await this.audit.log(
        {
          ...entity,
          action: 'payable.evaluated',
          fromStatus: 'processing',
          toStatus: status,
          data: { reasons },
        },
        tx,
      );
    });
  }

  /**
   * Algo falló después de la IA: la llamada ya se hizo, así que se registra (cuenta para la cuota) y el
   * expediente queda `failed` para poder reintentarlo, en vez de quedarse 5 minutos en `processing`.
   */
  private async failAfterExtraction(
    id: string,
    result: ExtractionResult,
    entity: Entity,
    error: unknown,
  ): Promise<void> {
    // STALE_STATUS: otro proceso ya movió el expediente y es dueño de su estado.
    if (error instanceof AppError && error.code === 'STALE_STATUS') return;
    await this.db
      .$transaction(async (tx) => {
        await this.audit.log(
          {
            ...entity,
            action: 'payable.extracted',
            data: {
              ok: true,
              model: result.model,
              promptVersion: result.promptVersion,
              ms: result.ms,
            },
          },
          tx,
        );
        await this.payables.markFailed(id, 'PROCESSING_ERROR', tx);
        await this.audit.log(
          {
            ...entity,
            action: 'payable.failed',
            fromStatus: 'processing',
            toStatus: 'failed',
            data: { failureCode: 'PROCESSING_ERROR' },
          },
          tx,
        );
      })
      // Si tampoco se puede registrar, se conserva el error original.
      .catch(() => undefined);
  }

  private async find(id: string): Promise<PayableRow> {
    const row = await this.payables.findById(id);
    if (!row) throw NOT_FOUND();
    return row;
  }

  private async checkQuota(actor: string): Promise<void> {
    const since = startOfLocalDay(this.today(), env.BUSINESS_TZ);
    const action = 'payable.extracted';
    const [byActor, total] = await Promise.all([
      this.audit.countSince({ action, actor, since }),
      this.audit.countSince({ action, since }),
    ]);
    checkQuota(
      { actor: byActor, total },
      { actor: env.DAILY_AI_LIMIT, total: env.DAILY_AI_LIMIT_GLOBAL },
    );
  }

  private today(): LocalDate {
    return toLocalDate(new Date(), env.BUSINESS_TZ);
  }
}

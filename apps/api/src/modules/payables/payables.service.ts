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
import { Db } from '../../common/db.js';
import { startOfLocalDay, toLocalDate } from '../../common/dates.js';
import { centsToMoney, moneyToCents } from '../../common/money.js';
import { env } from '../../config/env.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { PurchaseOrdersRepository } from '../purchase-orders/purchase-orders.repository.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';
import { checkQuota, checkReceivedOn, detectFileType } from './file.rules.js';
import { toPayableDto } from './payables.dto.js';
import { PayablesRepository, type PayableRow } from './payables.repository.js';
import {
  canRetry,
  evaluatePayable,
  normalizeExtraction,
  parseReason,
  type PayableContext,
} from './payables.rules.js';

const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe ese expediente.');

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

@Injectable()
export class PayablesService {
  constructor(
    private readonly db: Db,
    private readonly payables: PayablesRepository,
    private readonly orders: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly audit: AuditRepository,
    private readonly storage: StorageClient,
    private readonly extraction: ExtractionClient,
  ) {}

  async list(query: PayableListQuery): Promise<PayableList> {
    const rows = await this.payables.list(query);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        reviewReasons: row.reviewReasons.map(parseReason),
        fileName: row.fileName,
        supplierName: row.supplierName,
        invoiceNumber: row.invoiceNumber,
        poNumber: row.poNumber,
        total: row.total?.toFixed(2) ?? null,
        currency: row.currency,
      })),
    };
  }

  async get(id: string): Promise<PayableDto> {
    return toPayableDto(await this.find(id));
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
          fileName: file.originalname,
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
          data: { fileName: file.originalname, mimeType, fileSize: file.buffer.length },
        },
        tx,
      );
      return created;
    });

    return this.process(row, file.buffer, ['uploaded'], ctx);
  }

  async retry(id: string, ctx: Ctx): Promise<PayableDto> {
    const row = await this.find(id);
    if (!canRetry(row.status, row.updatedAt, new Date())) {
      throw new AppError('INVALID_TRANSITION', 'Este expediente no se puede reintentar.');
    }
    await this.checkQuota(ctx.actor);
    const bytes = await this.storage.get(row.fileKey);
    return this.process(row, bytes, ['failed', 'processing'], ctx);
  }

  /** Pasos 6–11 del flujo: lo comparten la carga y el reintento. */
  private async process(
    row: PayableRow,
    bytes: Buffer,
    from: ('uploaded' | 'failed' | 'processing')[],
    ctx: Ctx,
  ): Promise<PayableDto> {
    const entity = { ...ctx, entity: 'payable', entityId: row.id };
    await this.db.$transaction(async (tx) => {
      await this.payables.moveStatus(row.id, from, 'processing', tx);
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

    const facts = normalizeExtraction(result.data);
    const lookup = row.selectedPoNumber ?? facts.poNumber;
    const po = lookup ? await this.orders.findByNumber(lookup) : null;
    const supplier =
      po?.supplier ??
      (facts.supplierTaxId ? await this.suppliers.findByTaxId(facts.supplierTaxId) : null);
    const context: PayableContext = {
      selectedPoNumber: row.selectedPoNumber,
      purchaseOrder: po && {
        number: po.number,
        status: po.status,
        totalCents: moneyToCents(po.total.toFixed(2)),
        currency: po.currency,
        receiptStatus: po.receiptStatus,
        supplierTaxId: po.supplier.taxId,
      },
      duplicateOf: await this.payables.findLiveDuplicate({ ...facts, excludeId: row.id }),
      otherPayableForPo: po ? await this.payables.findLiveForPurchaseOrder(po.id, row.id) : null,
    };
    const { status, reasons } = evaluatePayable(facts, context);

    const money = (cents: number | null) => (cents === null ? null : centsToMoney(cents));
    await this.db.$transaction(async (tx) => {
      await this.payables.saveEvaluation(
        row.id,
        {
          status,
          extraction: {
            data: result.data,
            model: result.model,
            promptVersion: result.promptVersion,
            ms: result.ms,
          },
          isApDocument: facts.isApDocument,
          docType: facts.docType,
          supplierName: facts.supplierName,
          supplierTaxId: facts.supplierTaxId,
          invoiceNumber: facts.invoiceNumber,
          issueDate: facts.issueDate,
          poNumber: facts.poNumber,
          subtotal: money(facts.subtotalCents),
          taxes: money(facts.taxesCents),
          total: money(facts.totalCents),
          currency: facts.currency,
          taxUuid: facts.taxUuid,
          uncertainFields: facts.uncertainFields,
          reviewReasons: reasons,
          purchaseOrderId: po?.id ?? null,
          supplierId: supplier?.id ?? null,
        },
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

    return this.get(row.id);
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

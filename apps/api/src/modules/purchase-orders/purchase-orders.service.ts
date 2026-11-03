import { Injectable } from '@nestjs/common';
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderDraft,
  PoLineDto,
  PoLineInput,
  PurchaseOrderDto,
  PurchaseOrderList,
  PurchaseOrderListQuery,
  ReceiptInput,
  UpdatePurchaseOrderInput,
} from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { fromDbDate, startOfLocalDay, toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import { ExtractionClient } from '../../integrations/extraction.client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { checkQuota, decodeFileName, detectFileType } from '../payables/file.rules.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';
import {
  PurchaseOrdersRepository,
  type NewLine,
  type PurchaseOrderRow,
} from './purchase-orders.repository.js';
import {
  buildDraftWarnings,
  checkChecklist,
  checkIssuedOn,
  checkReceipt,
  checkTotalCoversLines,
  impliedTaxes,
  lineAmount,
  linesSubtotal,
  normalizePoExtraction,
} from './purchase-orders.rules.js';

const AUDITED_FIELDS = ['issuedOn', 'total', 'currency', 'parlevelRef', 'status', 'lines'] as const;
const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe esa orden de compra.');

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly db: Db,
    private readonly orders: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly audit: AuditRepository,
    private readonly extraction: ExtractionClient,
  ) {}

  async list(query: PurchaseOrderListQuery): Promise<PurchaseOrderList> {
    const rows = await this.orders.list(query);
    return { items: rows.map(toPurchaseOrderDto) };
  }

  async get(id: string): Promise<PurchaseOrderDto> {
    const row = await this.orders.findById(id);
    if (!row) throw NOT_FOUND();
    return toPurchaseOrderDto(row);
  }

  async create(input: CreatePurchaseOrderInput, ctx: Ctx): Promise<PurchaseOrderDto> {
    checkIssuedOn(input.issuedOn, today());
    const supplier = await this.suppliers.findById(input.supplierId);
    if (!supplier?.active) {
      throw new AppError('VALIDATION', undefined, {
        fieldErrors: { supplierId: 'Elige un proveedor activo' },
      });
    }

    const lines = withAmounts(input.lines);
    checkTotalCoversLines(input.total, linesSubtotal(lines));

    return this.db.$transaction(async (tx) => {
      const row = await this.orders.create({ ...input, lines, createdBy: ctx.actor }, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'purchase_order',
          entityId: row.id,
          action: 'purchase_order.created',
          data: { after: input },
        },
        tx,
      );
      return toPurchaseOrderDto(row);
    });
  }

  update(id: string, input: UpdatePurchaseOrderInput, ctx: Ctx): Promise<PurchaseOrderDto> {
    if (input.issuedOn) checkIssuedOn(input.issuedOn, today());

    return this.db.$transaction(async (tx) => {
      const before = await this.orders.findById(id, tx);
      if (!before) throw NOT_FOUND();

      const { lines: newLines, ...rest } = input;
      const lines = newLines && withAmounts(newLines);
      if (lines && before.receiptStatus === 'received') {
        throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
      }
      const effectiveLines = lines ?? before.lines.map(toLineDto);
      if (effectiveLines.length > 0) {
        checkTotalCoversLines(
          input.total ?? before.total.toFixed(2),
          linesSubtotal(effectiveLines),
        );
      }

      const after = await this.orders.update(id, { ...rest, lines }, tx);
      const changes = diffFields(
        toPurchaseOrderDto(before),
        toPurchaseOrderDto(after),
        AUDITED_FIELDS,
      );
      if (Object.keys(changes).length > 0) {
        await this.audit.log(
          {
            ...ctx,
            entity: 'purchase_order',
            entityId: id,
            action: 'purchase_order.updated',
            data: { changes },
          },
          tx,
        );
      }
      return toPurchaseOrderDto(after);
    });
  }

  /**
   * Lee el PDF de ParLevel y arma un borrador. No escribe ninguna OC: solo deja el evento de uso para
   * la cuota. La persona verifica el borrador y lo guarda con `create`.
   */
  async extract(
    file: { buffer: Buffer; originalname: string },
    ctx: Ctx,
  ): Promise<PurchaseOrderDraft> {
    const fileName = decodeFileName(file.originalname);
    if (detectFileType(file.buffer) !== 'application/pdf') {
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 'Sube la orden de compra en PDF.');
    }
    await this.checkExtractionQuota(ctx.actor);

    let result;
    try {
      result = await this.extraction.extractPurchaseOrder({
        bytes: file.buffer,
        mimeType: 'application/pdf',
        fileName,
      });
    } catch {
      throw new AppError('AI_UNAVAILABLE');
    }

    const normalized = normalizePoExtraction(result.data);
    const [supplier, existing] = await Promise.all([
      normalized.supplierTaxId ? this.suppliers.findByTaxId(normalized.supplierTaxId) : null,
      normalized.number ? this.orders.findByNumber(normalized.number) : null,
    ]);
    const draft = {
      ...normalized,
      supplier: supplier?.active
        ? {
            id: supplier.id,
            name: supplier.name,
            taxId: supplier.taxId,
            creditDays: supplier.creditDays,
            currency: supplier.currency,
          }
        : null,
    };
    const warnings = result.data.isPurchaseOrder
      ? buildDraftWarnings(draft, existing !== null)
      : [{ field: 'file', message: 'El documento no parece una orden de compra' }];

    await this.audit.log({
      ...ctx,
      entity: 'purchase_order',
      entityId: null,
      action: 'purchase_order.extracted',
      data: {
        model: result.model,
        promptVersion: result.promptVersion,
        ms: result.ms,
        lineCount: draft.lines.length,
      },
    });
    return { ...draft, warnings };
  }

  confirmReceipt(id: string, input: ReceiptInput, ctx: Ctx): Promise<PurchaseOrderDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.orders.findById(id, tx);
      if (!before) throw NOT_FOUND();
      checkReceipt({ ...before, issuedOn: fromDbDate(before.issuedOn) }, input.receivedOn, today());
      checkChecklist(
        before.lines.map((l) => l.id),
        input.checkedLineIds,
      );

      const after = await this.orders.markReceived(
        id,
        { receivedOn: input.receivedOn, receivedBy: ctx.actor, notes: input.notes },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'purchase_order',
          entityId: id,
          action: 'purchase_order.received',
          fromStatus: 'pending',
          toStatus: 'received',
          data: {
            receivedOn: input.receivedOn,
            notes: input.notes ?? null,
            lineCount: before.lines.length,
          },
        },
        tx,
      );
      return toPurchaseOrderDto(after);
    });
  }
  private async checkExtractionQuota(actor: string): Promise<void> {
    const since = startOfLocalDay(today(), env.BUSINESS_TZ);
    const action = 'purchase_order.extracted';
    const [byActor, total] = await Promise.all([
      this.audit.countSince({ action, actor, since }),
      this.audit.countSince({ action, since }),
    ]);
    checkQuota(
      { actor: byActor, total },
      { actor: env.DAILY_AI_LIMIT, total: env.DAILY_AI_LIMIT_GLOBAL },
    );
  }
}

function today() {
  return toLocalDate(new Date(), env.BUSINESS_TZ);
}

/** El importe de cada partida lo calcula el servidor, nunca viene del cliente. */
function withAmounts(lines: PoLineInput[]): NewLine[] {
  return lines.map((line) => ({ ...line, amount: lineAmount(line.quantity, line.unitPrice) }));
}

function toLineDto(line: PurchaseOrderRow['lines'][number]): PoLineDto {
  return {
    id: line.id,
    position: line.position,
    sku: line.sku,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    unitPrice: String(line.unitPrice),
    amount: line.amount.toFixed(2),
  };
}

function toPurchaseOrderDto(row: PurchaseOrderRow): PurchaseOrderDto {
  const lines = row.lines.map(toLineDto);
  return {
    id: row.id,
    number: row.number,
    supplier: {
      id: row.supplier.id,
      name: row.supplier.name,
      taxId: row.supplier.taxId,
      creditDays: row.supplier.creditDays,
    },
    issuedOn: fromDbDate(row.issuedOn),
    total: row.total.toFixed(2),
    taxes: impliedTaxes(row.total.toFixed(2), lines.length, linesSubtotal(lines)),
    currency: row.currency,
    parlevelRef: row.parlevelRef,
    lines,
    status: row.status,
    receiptStatus: row.receiptStatus,
    receivedOn: row.receivedOn ? fromDbDate(row.receivedOn) : null,
    receivedBy: row.receivedBy,
    receiptNotes: row.receiptNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

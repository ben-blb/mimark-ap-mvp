import { Injectable } from '@nestjs/common';
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderList,
  PurchaseOrderListQuery,
  ReceiptInput,
  UpdatePurchaseOrderInput,
} from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { fromDbDate, toLocalDate } from '../../common/dates.js';
import { env } from '../../config/env.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';
import { PurchaseOrdersRepository, type PurchaseOrderRow } from './purchase-orders.repository.js';
import { checkIssuedOn, checkReceipt } from './purchase-orders.rules.js';

const AUDITED_FIELDS = ['issuedOn', 'total', 'currency', 'parlevelRef', 'status'] as const;
const NOT_FOUND = () => new AppError('NOT_FOUND', 'No existe esa orden de compra.');

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly db: Db,
    private readonly orders: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly audit: AuditRepository,
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

    return this.db.$transaction(async (tx) => {
      const row = await this.orders.create({ ...input, createdBy: ctx.actor }, tx);
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

      const after = await this.orders.update(id, input, tx);
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

  confirmReceipt(id: string, input: ReceiptInput, ctx: Ctx): Promise<PurchaseOrderDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.orders.findById(id, tx);
      if (!before) throw NOT_FOUND();
      checkReceipt({ ...before, issuedOn: fromDbDate(before.issuedOn) }, input.receivedOn, today());

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
          data: { receivedOn: input.receivedOn, notes: input.notes ?? null },
        },
        tx,
      );
      return toPurchaseOrderDto(after);
    });
  }
}

function today() {
  return toLocalDate(new Date(), env.BUSINESS_TZ);
}

function toPurchaseOrderDto(row: PurchaseOrderRow): PurchaseOrderDto {
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
    currency: row.currency,
    parlevelRef: row.parlevelRef,
    status: row.status,
    receiptStatus: row.receiptStatus,
    receivedOn: row.receivedOn ? fromDbDate(row.receivedOn) : null,
    receivedBy: row.receivedBy,
    receiptNotes: row.receiptNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

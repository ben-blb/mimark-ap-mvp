import { Injectable } from '@nestjs/common';
import type { LocalDate } from '@mimark/contracts/common';
import type { PurchaseOrderListQuery } from '@mimark/contracts/purchase-orders';
import { AppError } from '../../common/app-error.js';
import { Db, isUniqueViolation, type Tx } from '../../common/db.js';
import { toDbDate } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

const WITH_SUPPLIER = { supplier: true } satisfies Prisma.PurchaseOrderInclude;
export type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof WITH_SUPPLIER }>;

export interface NewPurchaseOrder {
  number: string;
  supplierId: string;
  issuedOn: LocalDate;
  total: string;
  currency: 'MXN' | 'USD';
  parlevelRef?: string | undefined;
  createdBy: string;
}

export interface PurchaseOrderChanges {
  issuedOn?: LocalDate | undefined;
  total?: string | undefined;
  currency?: 'MXN' | 'USD' | undefined;
  parlevelRef?: string | undefined;
  status?: 'open' | 'cancelled' | undefined;
}

const DUPLICATE_NUMBER = new AppError('CONFLICT', 'Ya existe una OC con ese folio.', {
  fieldErrors: { number: 'Ya existe una OC con ese folio' },
});

/** Única puerta a la tabla de órdenes de compra. Solo el módulo purchase-orders escribe en ella. */
@Injectable()
export class PurchaseOrdersRepository {
  constructor(private readonly db: Db) {}

  list(query: PurchaseOrderListQuery): Promise<PurchaseOrderRow[]> {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (query.status !== 'all') where.status = query.status;
    if (query.receipt) where.receiptStatus = query.receipt;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return this.db.purchaseOrder.findMany({
      where,
      include: WITH_SUPPLIER,
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findById(id: string, tx: Tx = this.db): Promise<PurchaseOrderRow | null> {
    return tx.purchaseOrder.findUnique({ where: { id }, include: WITH_SUPPLIER });
  }

  findByNumber(number: string, tx: Tx = this.db): Promise<PurchaseOrderRow | null> {
    return tx.purchaseOrder.findUnique({ where: { number }, include: WITH_SUPPLIER });
  }

  async create(data: NewPurchaseOrder, tx: Tx = this.db): Promise<PurchaseOrderRow> {
    try {
      return await tx.purchaseOrder.create({
        data: { ...data, issuedOn: toDbDate(data.issuedOn) },
        include: WITH_SUPPLIER,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw DUPLICATE_NUMBER;
      throw error;
    }
  }

  update(id: string, changes: PurchaseOrderChanges, tx: Tx = this.db): Promise<PurchaseOrderRow> {
    const { issuedOn, ...rest } = changes;
    return tx.purchaseOrder.update({
      where: { id },
      data: { ...rest, ...(issuedOn && { issuedOn: toDbDate(issuedOn) }) },
      include: WITH_SUPPLIER,
    });
  }

  /** pending → received, condicionado al estado actual: dos confirmaciones simultáneas no pasan ambas. */
  async markReceived(
    id: string,
    receipt: { receivedOn: LocalDate; receivedBy: string; notes?: string | undefined },
    tx: Tx = this.db,
  ): Promise<PurchaseOrderRow> {
    const { count } = await tx.purchaseOrder.updateMany({
      where: { id, status: 'open', receiptStatus: 'pending' },
      data: {
        receiptStatus: 'received',
        receivedOn: toDbDate(receipt.receivedOn),
        receivedBy: receipt.receivedBy,
        receiptNotes: receipt.notes ?? null,
      },
    });
    if (count === 0) {
      throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
    }
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: WITH_SUPPLIER });
  }
}

import { Injectable } from '@nestjs/common';
import type { LocalDate } from '@mimark/contracts/common';
import type { PurchaseOrderListQuery } from '@mimark/contracts/purchase-orders';
import type { ReceiptListQuery } from '@mimark/contracts/receipts';
import { AppError } from '../../common/app-error.js';
import { Db, isUniqueViolation, type Tx } from '../../common/db.js';
import { toDbDate } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

const WITH_SUPPLIER = {
  supplier: true,
  lines: { orderBy: { position: 'asc' } },
  /** Expediente vivo (no descartado) más antiguo, solo lectura, para calcular la etapa (spec 019). */
  payables: {
    where: { status: { not: 'discarded' } },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      dueOn: true,
      scheduledPayOn: true,
      paidOn: true,
    },
  },
} satisfies Prisma.PurchaseOrderInclude;
export type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof WITH_SUPPLIER }>;

/** Recepciones (spec 017): solo columnas sin precios ni importes. Un campo nuevo de la OC no entra aquí solo. */
const RECEIPT_SELECT = {
  id: true,
  number: true,
  issuedOn: true,
  receiptStatus: true,
  receivedOn: true,
  receivedBy: true,
  receiptNotes: true,
  supplier: { select: { name: true } },
  lines: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      sku: true,
      description: true,
      quantity: true,
      unit: true,
      receivedQuantity: true,
    },
  },
} satisfies Prisma.PurchaseOrderSelect;
export type ReceiptOrderRow = Prisma.PurchaseOrderGetPayload<{ select: typeof RECEIPT_SELECT }>;

export interface NewLine {
  sku?: string | undefined;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
}

export interface NewPurchaseOrder {
  number: string;
  supplierId: string;
  issuedOn: LocalDate;
  total: string;
  currency: 'MXN' | 'USD';
  parlevelRef?: string | undefined;
  lines: NewLine[];
  createdBy: string;
}

export interface PurchaseOrderChanges {
  issuedOn?: LocalDate | undefined;
  total?: string | undefined;
  currency?: 'MXN' | 'USD' | undefined;
  parlevelRef?: string | undefined;
  status?: 'open' | 'cancelled' | undefined;
  /** Reemplaza todas las partidas. */
  lines?: NewLine[] | undefined;
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
    if (query.awaitingInvoice) {
      where.status = 'open';
      where.receiptStatus = { in: ['received', 'received_with_differences'] };
      where.payables = { none: { status: { not: 'discarded' } } };
    }
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

  /** Órdenes abiertas (no canceladas) vistas desde Almacén: sin precios. */
  listReceipts(query: ReceiptListQuery): Promise<ReceiptOrderRow[]> {
    // `received` incluye las recibidas con diferencias.
    const receiptStatus =
      query.status === 'received'
        ? { in: ['received', 'received_with_differences'] as const }
        : query.status;
    const where: Prisma.PurchaseOrderWhereInput = {
      status: 'open',
      receiptStatus:
        typeof receiptStatus === 'string' ? receiptStatus : { in: [...receiptStatus.in] },
    };
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return this.db.purchaseOrder.findMany({
      where,
      select: RECEIPT_SELECT,
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findReceiptById(id: string): Promise<ReceiptOrderRow | null> {
    return this.db.purchaseOrder.findFirst({
      where: { id, status: 'open' },
      select: RECEIPT_SELECT,
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
      const { lines, ...order } = data;
      return await tx.purchaseOrder.create({
        data: {
          ...order,
          issuedOn: toDbDate(order.issuedOn),
          lines: { create: toLineRows(lines) },
        },
        include: WITH_SUPPLIER,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw DUPLICATE_NUMBER;
      throw error;
    }
  }

  async update(
    id: string,
    changes: PurchaseOrderChanges,
    tx: Tx = this.db,
  ): Promise<PurchaseOrderRow> {
    const { issuedOn, lines, ...rest } = changes;
    if (lines) await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...rest,
        ...(issuedOn && { issuedOn: toDbDate(issuedOn) }),
        ...(lines && { lines: { create: toLineRows(lines) } }),
      },
      include: WITH_SUPPLIER,
    });
  }

  /**
   * pending → received | received_with_differences, condicionado al estado actual: dos confirmaciones
   * simultáneas no pasan ambas. Guarda lo recibido de cada partida.
   */
  async markReceived(
    id: string,
    receipt: {
      status: 'received' | 'received_with_differences';
      receivedOn: LocalDate;
      receivedBy: string;
      notes?: string | undefined;
      lines: { lineId: string; receivedQuantity: string }[];
    },
    tx: Tx = this.db,
  ): Promise<PurchaseOrderRow> {
    const { count } = await tx.purchaseOrder.updateMany({
      where: { id, status: 'open', receiptStatus: 'pending' },
      data: {
        receiptStatus: receipt.status,
        receivedOn: toDbDate(receipt.receivedOn),
        receivedBy: receipt.receivedBy,
        receiptNotes: receipt.notes ?? null,
      },
    });
    if (count === 0) {
      throw new AppError('INVALID_TRANSITION', 'La recepción ya fue confirmada.');
    }
    for (const line of receipt.lines) {
      await tx.purchaseOrderLine.update({
        where: { id: line.lineId },
        data: { receivedQuantity: line.receivedQuantity },
      });
    }
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: WITH_SUPPLIER });
  }
}

function toLineRows(lines: NewLine[]) {
  return lines.map((line, i) => ({ ...line, sku: line.sku || null, position: i + 1 }));
}

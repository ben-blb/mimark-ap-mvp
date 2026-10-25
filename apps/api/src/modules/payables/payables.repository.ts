import { Injectable } from '@nestjs/common';
import type { Currency, LocalDate } from '@mimark/contracts/common';
import type { PayableListQuery, PayableStatus } from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import { Db, type Tx } from '../../common/db.js';
import { toDbDate } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

const WITH_RELATIONS = { purchaseOrder: true, supplier: true } satisfies Prisma.PayableInclude;
export type PayableRow = Prisma.PayableGetPayload<{ include: typeof WITH_RELATIONS }>;

/** Expediente vivo: cualquier estado excepto out_of_scope, failed y discarded. */
const NOT_LIVE: PayableStatus[] = ['out_of_scope', 'failed', 'discarded'];
const LIST_LIMIT = 200;

export interface NewPayable {
  createdBy: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  selectedPoNumber: string | null;
  invoiceReceivedOn: LocalDate;
}

/** Campos vigentes del expediente y su decisión, en la forma de la tabla. */
export interface PayableFieldValues {
  isApDocument: boolean;
  docType: 'factura' | 'ticket' | 'remision' | 'otro' | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  issueDate: LocalDate | null;
  poNumber: string | null;
  subtotal: string | null;
  taxes: string | null;
  total: string | null;
  currency: Currency | null;
  taxUuid: string | null;
  uncertainFields: string[];
  reviewReasons: string[];
  purchaseOrderId: string | null;
  supplierId: string | null;
}

/** Salida de la IA más el resultado de las reglas (la primera evaluación). */
export interface PayableEvaluation extends PayableFieldValues {
  status: PayableStatus;
  extraction: Prisma.InputJsonValue;
}

/** Lo que una acción humana leyó del expediente: si cambió desde entonces, la acción falla (STALE_STATUS). */
export type Seen = Pick<PayableRow, 'id' | 'status' | 'updatedAt'>;

const STALE = () => new AppError('STALE_STATUS');

/** Única puerta a la tabla de expedientes. Solo el módulo payables escribe en ella. */
@Injectable()
export class PayablesRepository {
  constructor(private readonly db: Db) {}

  create(data: NewPayable, tx: Tx = this.db): Promise<PayableRow> {
    return tx.payable.create({
      data: { ...data, invoiceReceivedOn: toDbDate(data.invoiceReceivedOn) },
      include: WITH_RELATIONS,
    });
  }

  findById(id: string, tx: Tx = this.db): Promise<PayableRow | null> {
    return tx.payable.findUnique({ where: { id }, include: WITH_RELATIONS });
  }

  list(query: PayableListQuery): Promise<PayableRow[]> {
    const where: Prisma.PayableWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.createdBy) where.createdBy = { equals: query.createdBy, mode: 'insensitive' };
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' } as const;
      where.OR = [
        { supplierName: contains },
        { invoiceNumber: contains },
        { poNumber: contains },
        { fileName: contains },
      ];
    }
    return this.db.payable.findMany({
      where,
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  /** Id de otro expediente vivo con el mismo UUID fiscal, o el mismo RFC + número de factura. */
  async findLiveDuplicate(match: {
    taxUuid: string | null;
    supplierTaxId: string | null;
    invoiceNumber: string | null;
    excludeId: string;
  }): Promise<string | null> {
    const or: Prisma.PayableWhereInput[] = [];
    if (match.taxUuid) or.push({ taxUuid: match.taxUuid });
    if (match.supplierTaxId && match.invoiceNumber) {
      or.push({ supplierTaxId: match.supplierTaxId, invoiceNumber: match.invoiceNumber });
    }
    if (or.length === 0) return null;
    const found = await this.db.payable.findFirst({
      where: { OR: or, id: { not: match.excludeId }, status: { notIn: NOT_LIVE } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return found?.id ?? null;
  }

  /** Id de otro expediente vivo ligado a la misma OC. */
  async findLiveForPurchaseOrder(
    purchaseOrderId: string,
    excludeId: string,
  ): Promise<string | null> {
    const found = await this.db.payable.findFirst({
      where: { purchaseOrderId, id: { not: excludeId }, status: { notIn: NOT_LIVE } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return found?.id ?? null;
  }

  /** Condicionado al estado actual: si otro proceso ya lo movió, lanza STALE_STATUS. */
  async moveStatus(
    id: string,
    from: PayableStatus[],
    to: PayableStatus,
    tx: Tx = this.db,
  ): Promise<void> {
    const { count } = await tx.payable.updateMany({
      where: { id, status: { in: from } },
      data: { status: to },
    });
    if (count === 0) throw STALE();
  }

  /**
   * Reclama un expediente para reintentarlo: `failed`, o `processing` sin cambios desde `staleBefore`.
   * Es atómico: de dos reintentos simultáneos solo uno lo logra y el otro recibe STALE_STATUS.
   */
  async claimForRetry(id: string, staleBefore: Date, tx: Tx = this.db): Promise<void> {
    const { count } = await tx.payable.updateMany({
      where: {
        id,
        OR: [{ status: 'failed' }, { status: 'processing', updatedAt: { lt: staleBefore } }],
      },
      data: { status: 'processing' },
    });
    if (count === 0) throw STALE();
  }

  /** processing → resultado de las reglas, con los campos vigentes. */
  async saveEvaluation(id: string, data: PayableEvaluation, tx: Tx = this.db): Promise<void> {
    const { issueDate, ...rest } = data;
    const { count } = await tx.payable.updateMany({
      where: { id, status: 'processing' },
      data: { ...rest, issueDate: issueDate ? toDbDate(issueDate) : null, failureCode: null },
    });
    if (count === 0) throw STALE();
  }

  async markFailed(id: string, failureCode: string, tx: Tx = this.db): Promise<void> {
    const { count } = await tx.payable.updateMany({
      where: { id, status: 'processing' },
      data: { status: 'failed', failureCode },
    });
    if (count === 0) throw STALE();
  }

  // ── Acciones humanas (spec 005). Todas condicionadas a lo que la persona vio: estado y updatedAt. ──

  private async guarded(
    seen: Seen,
    data: Prisma.PayableUncheckedUpdateManyInput,
    tx: Tx,
  ): Promise<void> {
    const { count } = await tx.payable.updateMany({
      where: { id: seen.id, status: seen.status, updatedAt: seen.updatedAt },
      data,
    });
    if (count === 0) throw STALE();
  }

  /** Campos corregidos y su nueva decisión. */
  saveCorrection(
    seen: Seen,
    data: PayableFieldValues & { status: PayableStatus; selectedPoNumber: string | null },
    tx: Tx = this.db,
  ): Promise<void> {
    const { issueDate, ...rest } = data;
    return this.guarded(seen, { ...rest, issueDate: issueDate ? toDbDate(issueDate) : null }, tx);
  }

  markReviewRequired(seen: Seen, reasons: string[], tx: Tx = this.db): Promise<void> {
    return this.guarded(seen, { status: 'requires_review', reviewReasons: reasons }, tx);
  }

  /** pending_confirmation → confirmed. Las llaves únicas hacen que la base impida confirmar dos veces. */
  confirm(
    seen: Seen,
    data: {
      dueOn: LocalDate;
      suggestedPayOn: LocalDate;
      urgent: boolean;
      uuidKey: string | null;
      folioKey: string;
      invoiceDocStatus: 'pending' | 'received';
      complementStatus: 'pending' | null;
    },
    tx: Tx = this.db,
  ): Promise<void> {
    return this.guarded(
      seen,
      {
        ...data,
        status: 'confirmed',
        reviewReasons: [],
        dueOn: toDbDate(data.dueOn),
        suggestedPayOn: toDbDate(data.suggestedPayOn),
      },
      tx,
    );
  }

  schedule(seen: Seen, payOn: LocalDate, tx: Tx = this.db): Promise<void> {
    return this.guarded(seen, { status: 'scheduled', scheduledPayOn: toDbDate(payOn) }, tx);
  }

  markPaid(
    seen: Seen,
    payment: { paidOn: LocalDate; amount: string; reference: string },
    tx: Tx = this.db,
  ): Promise<void> {
    return this.guarded(
      seen,
      {
        status: 'paid',
        paidOn: toDbDate(payment.paidOn),
        paidAmount: payment.amount,
        paymentRef: payment.reference,
      },
      tx,
    );
  }

  saveDocuments(
    seen: Seen,
    data: { invoiceDocStatus?: 'pending' | 'received'; complementStatus?: 'pending' | 'received' },
    tx: Tx = this.db,
  ): Promise<void> {
    return this.guarded(seen, data, tx);
  }

  discard(seen: Seen, reason: string, tx: Tx = this.db): Promise<void> {
    return this.guarded(seen, { status: 'discarded', discardReason: reason }, tx);
  }
}

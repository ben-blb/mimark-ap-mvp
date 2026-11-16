import type { PoLineDto, PoProgress, PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import type { ReceiptOrderDto } from '@mimark/contracts/receipts';
import { fromDbDate } from '../../common/dates.js';
import { centsToMoney } from '../../common/money.js';
import type { PurchaseOrderRow, ReceiptOrderRow } from './purchase-orders.repository.js';
import { poStage, receivedSubtotalCents } from './purchase-orders.progress.rules.js';
import { impliedTaxes, linesSubtotal } from './purchase-orders.rules.js';

export function toLineDto(line: PurchaseOrderRow['lines'][number]): PoLineDto {
  return {
    id: line.id,
    position: line.position,
    sku: line.sku,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    unitPrice: String(line.unitPrice),
    amount: line.amount.toFixed(2),
    receivedQuantity: line.receivedQuantity === null ? null : String(line.receivedQuantity),
  };
}

export function toReceiptDto(row: ReceiptOrderRow): ReceiptOrderDto {
  return {
    id: row.id,
    number: row.number,
    supplierName: row.supplier.name,
    issuedOn: fromDbDate(row.issuedOn),
    receiptStatus: row.receiptStatus,
    receivedOn: row.receivedOn ? fromDbDate(row.receivedOn) : null,
    receivedBy: row.receivedBy,
    receiptNotes: row.receiptNotes,
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      sku: line.sku,
      description: line.description,
      quantity: String(line.quantity),
      unit: line.unit,
      receivedQuantity: line.receivedQuantity === null ? null : String(line.receivedQuantity),
    })),
  };
}

export function toPurchaseOrderDto(row: PurchaseOrderRow): PurchaseOrderDto {
  const lines = row.lines.map(toLineDto);
  const received = receivedSubtotalCents(
    row.lines.map((l) => ({
      receivedQuantity: l.receivedQuantity?.toString() ?? null,
      unitPrice: l.unitPrice.toString(),
    })),
  );
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
    linesSubtotal: linesSubtotal(lines),
    receivedSubtotal: received === null ? null : centsToMoney(received),
    progress: toProgress(row),
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

/** Etapa y expediente vivo de la orden, sin importes (spec 019). */
export function toProgress(row: PurchaseOrderRow): PoProgress {
  const live = row.payables[0] ?? null;
  return {
    stage: poStage(row, live?.status ?? null),
    invoice: live && {
      payableId: live.id,
      status: live.status,
      invoiceNumber: live.invoiceNumber,
      dueOn: live.dueOn ? fromDbDate(live.dueOn) : null,
      scheduledPayOn: live.scheduledPayOn ? fromDbDate(live.scheduledPayOn) : null,
      paidOn: live.paidOn ? fromDbDate(live.paidOn) : null,
    },
  };
}

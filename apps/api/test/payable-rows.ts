import type { LocalDate } from '@mimark/contracts/common';
import type { Db } from '../src/common/db.js';
import { toDbDate } from '../src/common/dates.js';
import type { Prisma } from '../src/generated/prisma/client.js';

type Over = Partial<
  Omit<Prisma.PayableUncheckedCreateInput, 'dueOn' | 'suggestedPayOn' | 'scheduledPayOn' | 'paidOn'>
> & {
  dueOn?: LocalDate;
  suggestedPayOn?: LocalDate;
  scheduledPayOn?: LocalDate;
  paidOn?: LocalDate;
};

/**
 * Inserta un expediente ya procesado directo en la base (sin pasar por la IA), para pruebas de listas y
 * tablero donde importan las fechas, los importes y los estados.
 */
export async function insertPayable(db: Db, over: Over = {}): Promise<string> {
  const { dueOn, suggestedPayOn, scheduledPayOn, paidOn, ...rest } = over;
  const row = await db.payable.create({
    data: {
      status: 'confirmed',
      createdBy: 'Ana Pruebas',
      fileKey: 'test/x',
      fileName: 'factura.pdf',
      mimeType: 'application/pdf',
      fileSize: 10,
      invoiceReceivedOn: new Date('2026-10-01'),
      isApDocument: true,
      docType: 'factura',
      supplierName: 'Proveedor Demo',
      supplierTaxId: 'DAN010203AB1',
      invoiceNumber: `F-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      total: '1000.00',
      currency: 'MXN',
      ...(dueOn && { dueOn: toDbDate(dueOn) }),
      ...(suggestedPayOn && { suggestedPayOn: toDbDate(suggestedPayOn) }),
      ...(scheduledPayOn && { scheduledPayOn: toDbDate(scheduledPayOn) }),
      ...(paidOn && { paidOn: toDbDate(paidOn) }),
      ...rest,
    },
  });
  return row.id;
}

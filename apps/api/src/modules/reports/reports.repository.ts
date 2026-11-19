import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { Db } from '../../common/db.js';

const WITH_DETAIL = {
  kiosk: { select: { name: true } },
  account: { select: { name: true } },
  upload: { select: { fileName: true } },
} satisfies Prisma.LedgerEntryInclude;

export type ReportEntryRow = Prisma.LedgerEntryGetPayload<{ include: typeof WITH_DETAIL }>;

export interface MonthData {
  period: { id: string; status: 'open' | 'closed' } | null;
  entries: ReportEntryRow[];
  categories: Prisma.CategoryGetPayload<object>[];
  rules: Prisma.ClassificationRuleGetPayload<object>[];
  kiosks: { id: string; name: string }[];
}

/**
 * Solo lectura (spec 024): movimientos, categorías, reglas y kioskos de un mes. Nunca escribe;
 * esas tablas las escribe el módulo `closing`.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly db: Db) {}

  /** Todo lo de un mes en una sola transacción, para que los totales cuadren con el detalle. */
  async loadMonth(companyId: string, month: string): Promise<MonthData> {
    const [period, entries, categories, rules, kiosks] = await this.db.$transaction([
      this.db.reportPeriod.findUnique({
        where: { companyId_month: { companyId, month } },
        select: { id: true, status: true },
      }),
      this.db.ledgerEntry.findMany({
        where: { period: { companyId, month } },
        include: WITH_DETAIL,
        orderBy: [{ date: 'asc' }, { source: 'asc' }, { rowNumber: 'asc' }, { id: 'asc' }],
      }),
      this.db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.db.classificationRule.findMany({ where: { active: true } }),
      this.db.kiosk.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { period, entries, categories, rules, kiosks };
  }

  findUpload(id: string): Promise<{ fileKey: string; fileName: string } | null> {
    return this.db.sourceUpload.findUnique({
      where: { id },
      select: { fileKey: true, fileName: true },
    });
  }
}

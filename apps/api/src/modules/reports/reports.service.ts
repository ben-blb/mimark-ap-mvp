import { Injectable } from '@nestjs/common';
import {
  ReportLine,
  type DrillDto,
  type DrillQuery,
  type EdoResDto,
  type EdoResQuery,
  type KioskReportDto,
  type ReportQuery,
  type SupplierReportDto,
} from '@mimark/contracts/reports';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { SpreadsheetClient } from '../../integrations/spreadsheet.client.js';
import { AppError } from '../../common/app-error.js';
import { ClosingRepository } from '../closing/closing.repository.js';
import { StorageClient } from '../../integrations/storage.client.js';
import { toDrillEntry, toReportEntry, type DetailedEntry } from './reports.dto.js';
import { ReportsRepository } from './reports.repository.js';
import { exportSheets } from './reports-export.rules.js';
import { kioskRows } from './reports-kiosks.rules.js';
import { supplierRows, type SupplierRule } from './reports-suppliers.rules.js';
import {
  buildEdoRes,
  drillLine,
  reportStatus,
  withComparison,
  type ReportCategory,
} from './reports.rules.js';
import type { CompanyList, EdoResLine } from '@mimark/contracts/closing';
import { toCompany } from '../closing/closing.dto.js';

const FILE_TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** Reportes del cierre (spec 024): solo lee y llama a las reglas; no escribe nada. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly reports: ReportsRepository,
    private readonly storage: StorageClient,
    private readonly sheets: SpreadsheetClient,
    private readonly audit: AuditRepository,
  ) {}

  /** Las empresas activas, para elegir qué reporte ver (gerencia no tiene `reports:read`). */
  async companies(): Promise<CompanyList> {
    return { items: (await this.closing.listCompanies(false)).map(toCompany) };
  }

  /** Los movimientos del mes y lo que las reglas necesitan para leerlos. */
  async month(companyId: string, month: string) {
    if (!(await this.closing.findCompany(companyId))) {
      throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    }
    const data = await this.reports.loadMonth(companyId, month);
    const categories: ReportCategory[] = data.categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      edoResLine: c.edoResLine as EdoResLine,
      sortOrder: c.sortOrder,
    }));
    const rules: SupplierRule[] = data.rules.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      patternKey: r.patternKey,
      priority: r.priority,
      active: r.active,
      categoryId: r.categoryId,
    }));
    return {
      closed: data.period?.status === 'closed',
      entries: data.entries.map(toReportEntry),
      categories,
      rules,
      kiosks: data.kiosks,
    };
  }

  async edoRes(
    query: EdoResQuery,
    loaded?: Awaited<ReturnType<ReportsService['month']>>,
  ): Promise<EdoResDto> {
    const current = loaded ?? (await this.month(query.companyId, query.month));
    const { rows, counted } = buildEdoRes(current.entries, current.categories);
    let outRows = rows;
    if (query.compareTo) {
      const before = await this.month(query.companyId, query.compareTo);
      outRows = withComparison(rows, buildEdoRes(before.entries, before.categories).rows);
    }
    return {
      companyId: query.companyId,
      month: query.month,
      status: reportStatus(counted, current.closed),
      compareTo: query.compareTo ?? null,
      rows: outRows,
    };
  }

  async drill(rawLine: string, query: DrillQuery): Promise<DrillDto> {
    const parsed = ReportLine.safeParse(rawLine);
    if (!parsed.success) throw new AppError('NOT_FOUND', 'No existe ese renglón.');
    const current = await this.month(query.companyId, query.month);
    const result = drillLine<DetailedEntry>(parsed.data, current.entries, current.categories);
    const start = (query.page - 1) * query.pageSize;
    return {
      line: parsed.data,
      amount: result.amount,
      categories: result.categories,
      items: result.entries.slice(start, start + query.pageSize).map(toDrillEntry),
      total: result.entries.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async kiosks(query: ReportQuery): Promise<KioskReportDto> {
    const current = await this.month(query.companyId, query.month);
    const { counted } = buildEdoRes(current.entries, current.categories);
    return {
      companyId: query.companyId,
      month: query.month,
      status: reportStatus(counted, current.closed),
      ...kioskRows(current.entries, current.categories, current.kiosks),
    };
  }

  async suppliers(query: ReportQuery): Promise<SupplierReportDto> {
    const current = await this.month(query.companyId, query.month);
    const { counted } = buildEdoRes(current.entries, current.categories);
    return {
      companyId: query.companyId,
      month: query.month,
      status: reportStatus(counted, current.closed),
      ...supplierRows(current.entries, current.categories, current.rules),
    };
  }

  /** El archivo de origen de un movimiento, tal como se cargó. */
  async uploadFile(id: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    const upload = await this.reports.findUpload(id);
    if (!upload) throw new AppError('NOT_FOUND', 'No encontramos el archivo original.');
    const extension = upload.fileName.split('.').pop()?.toLowerCase() ?? '';
    return {
      bytes: await this.storage.get(upload.fileKey),
      mimeType: FILE_TYPES[extension] ?? 'application/octet-stream',
      fileName: upload.fileName,
    };
  }

  /** El libro de Excel del mes (AC-024-14) y su evento de auditoría. */
  async export(query: EdoResQuery, ctx: Ctx): Promise<{ bytes: Buffer; fileName: string }> {
    // Una sola lectura del mes: todas las hojas salen del mismo conjunto de movimientos.
    const current = await this.month(query.companyId, query.month);
    const edo = await this.edoRes(query, current);
    const bytes = await this.sheets.write(
      exportSheets({
        edo: edo.rows,
        kiosks: kioskRows(current.entries, current.categories, current.kiosks),
        suppliers: supplierRows(current.entries, current.categories, current.rules).rows,
        entries: current.entries,
        categories: current.categories,
      }),
    );
    await this.db.$transaction((tx) =>
      this.audit.log(
        {
          ...ctx,
          entity: 'report',
          entityId: `${query.companyId}:${query.month}`,
          action: 'report.exported',
          data: { companyId: query.companyId, month: query.month, rows: edo.rows.length },
        },
        tx,
      ),
    );
    return { bytes, fileName: `edo-res-${query.month}.xlsx` };
  }
}

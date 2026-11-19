import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { Id } from '@mimark/contracts/common';
import type { CompanyList } from '@mimark/contracts/closing';
import {
  DrillQuery,
  EdoResQuery,
  ReportQuery,
  type DrillDto,
  type EdoResDto,
  type KioskReportDto,
  type SupplierReportDto,
} from '@mimark/contracts/reports';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ReportsService } from './reports.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Requires('reports:view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('companies')
  companies(): Promise<CompanyList> {
    return this.reports.companies();
  }

  @Get('edo-res')
  edoRes(@Query({ schema: EdoResQuery }) query: EdoResQuery): Promise<EdoResDto> {
    return this.reports.edoRes(query);
  }

  @Get('edo-res/export')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async export(
    @Query({ schema: EdoResQuery }) query: EdoResQuery,
    @Ctx() ctx: Ctx,
  ): Promise<StreamableFile> {
    const { bytes, fileName } = await this.reports.export(query, ctx);
    return new StreamableFile(bytes, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }

  @Get('edo-res/lines/:line/entries')
  drill(
    @Param('line', { schema: z.string().min(1).max(100) }) line: string,
    @Query({ schema: DrillQuery }) query: DrillQuery,
  ): Promise<DrillDto> {
    return this.reports.drill(line, query);
  }

  @Get('kiosks')
  kiosks(@Query({ schema: ReportQuery }) query: ReportQuery): Promise<KioskReportDto> {
    return this.reports.kiosks(query);
  }

  @Get('suppliers')
  suppliers(@Query({ schema: ReportQuery }) query: ReportQuery): Promise<SupplierReportDto> {
    return this.reports.suppliers(query);
  }

  @Get('uploads/:id/file')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async file(@Param('id', { schema: Id }) id: string): Promise<StreamableFile> {
    const { bytes, mimeType, fileName } = await this.reports.uploadFile(id);
    return new StreamableFile(bytes, {
      type: mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }
}

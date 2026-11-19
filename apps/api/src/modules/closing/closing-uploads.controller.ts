import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Id } from '@mimark/contracts/common';
import {
  BankPdfInput,
  ConfirmUploadInput,
  UpdateBankDraftInput,
  UploadInput,
  UploadListQuery,
  type BankStatementDraft,
  type UploadDto,
  type UploadList,
  type UploadPreviewDto,
} from '@mimark/contracts/closing-uploads';
import { MAX_FILE_BYTES } from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingBankPdfService } from './closing-bank-pdf.service.js';
import { ClosingConfirmService } from './closing-confirm.service.js';
import { ClosingUploadsService } from './closing-uploads.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing/uploads')
export class ClosingUploadsController {
  constructor(
    private readonly uploads: ClosingUploadsService,
    private readonly bankPdf: ClosingBankPdfService,
    private readonly confirmation: ClosingConfirmService,
  ) {}

  @Requires('reports:write')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body({ schema: UploadInput }) input: UploadInput,
    @Ctx() ctx: Ctx,
  ): Promise<UploadPreviewDto> {
    if (!file) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { file: 'Elige un archivo' } });
    }
    return this.uploads.upload(file, input, ctx);
  }

  /** Estado de cuenta en PDF (spec 022): la IA propone las filas; no se crea ningún movimiento. */
  @Requires('reports:write')
  @Post('bank-pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  uploadBankPdf(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body({ schema: BankPdfInput }) input: BankPdfInput,
    @Ctx() ctx: Ctx,
  ): Promise<BankStatementDraft> {
    if (!file) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { file: 'Elige un archivo' } });
    }
    return this.bankPdf.upload(file, input, ctx);
  }

  @Requires('reports:write')
  @Patch(':id/draft')
  editDraft(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateBankDraftInput }) input: UpdateBankDraftInput,
    @Ctx() ctx: Ctx,
  ): Promise<BankStatementDraft> {
    return this.bankPdf.editDraft(id, input, ctx);
  }

  @Requires('reports:read')
  @Get()
  list(@Query({ schema: UploadListQuery }) query: UploadListQuery): Promise<UploadList> {
    return this.uploads.list(query);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post(':id/confirm')
  confirm(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: ConfirmUploadInput }) input: ConfirmUploadInput,
    @Ctx() ctx: Ctx,
  ): Promise<UploadDto> {
    return this.confirmation.confirm(id, input, ctx);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post(':id/discard')
  discard(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<UploadDto> {
    return this.uploads.discard(id, ctx);
  }
}

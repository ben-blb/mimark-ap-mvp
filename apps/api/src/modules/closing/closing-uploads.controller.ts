import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Id } from '@mimark/contracts/common';
import {
  UploadInput,
  UploadListQuery,
  type UploadDto,
  type UploadList,
  type UploadPreviewDto,
} from '@mimark/contracts/closing-uploads';
import { MAX_FILE_BYTES } from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingUploadsService } from './closing-uploads.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing/uploads')
export class ClosingUploadsController {
  constructor(private readonly uploads: ClosingUploadsService) {}

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

  @Requires('reports:read')
  @Get()
  list(@Query({ schema: UploadListQuery }) query: UploadListQuery): Promise<UploadList> {
    return this.uploads.list(query);
  }

  @Requires('reports:write')
  @HttpCode(200)
  @Post(':id/discard')
  discard(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<UploadDto> {
    return this.uploads.discard(id, ctx);
  }
}

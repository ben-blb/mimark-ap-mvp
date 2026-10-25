import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Id } from '@mimark/contracts/common';
import {
  MAX_FILE_BYTES,
  type PayableDto,
  type PayableHistory,
  type PayableList,
  PayableListQuery,
  UploadPayableInput,
} from '@mimark/contracts/payables';
import { AppError } from '../../common/app-error.js';
import { Ctx } from '../../common/ctx.js';
import { PayablesService } from './payables.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('payables')
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body({ schema: UploadPayableInput }) input: UploadPayableInput,
    @Ctx() ctx: Ctx,
  ): Promise<PayableDto> {
    if (!file) {
      throw new AppError('VALIDATION', undefined, { fieldErrors: { file: 'Elige un archivo' } });
    }
    return this.payables.upload(file, input, ctx);
  }

  @Get()
  list(@Query({ schema: PayableListQuery }) query: PayableListQuery): Promise<PayableList> {
    return this.payables.list(query);
  }

  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<PayableDto> {
    return this.payables.get(id);
  }

  @Get(':id/file')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async file(@Param('id', { schema: Id }) id: string): Promise<StreamableFile> {
    const { bytes, mimeType, fileName } = await this.payables.file(id);
    return new StreamableFile(bytes, {
      type: mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }

  @Get(':id/history')
  history(@Param('id', { schema: Id }) id: string): Promise<PayableHistory> {
    return this.payables.history(id);
  }

  @Post(':id/retry')
  retry(@Param('id', { schema: Id }) id: string, @Ctx() ctx: Ctx): Promise<PayableDto> {
    return this.payables.retry(id, ctx);
  }
}

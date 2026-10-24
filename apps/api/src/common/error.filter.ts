import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorResponse } from '@mimark/contracts/errors';
import type { Request, Response } from 'express';
import { AppError } from './app-error.js';
import { isNotFound, isUniqueViolation } from './db.js';

/** Toda falla sale como { code, message, requestId }. El stack solo va al log. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const error = toAppError(exception);

    if (error.code === 'INTERNAL') {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error({ requestId: req.requestId, stack });
    }

    res.locals.errorCode = error.code;
    const body: ErrorResponse = {
      code: error.code,
      message: error.message,
      requestId: req.requestId,
      ...error.extra,
    };
    res.status(error.status).json(body);
  }
}

function toAppError(exception: unknown): AppError {
  if (exception instanceof AppError) return exception;
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 400)
      return new AppError('VALIDATION', 'La petición no tiene un formato válido.');
    if (status === 404) return new AppError('NOT_FOUND');
    if (status === 413) return new AppError('VALIDATION', 'La petición es demasiado grande.');
    if (status === 429) return new AppError('RATE_LIMITED');
  }
  if (isUniqueViolation(exception)) return new AppError('CONFLICT');
  if (isNotFound(exception)) return new AppError('NOT_FOUND');
  return new AppError('INTERNAL');
}

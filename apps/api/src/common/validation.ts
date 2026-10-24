import {
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { AppError } from './app-error.js';

type Issues = Parameters<NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>>[0];

/**
 * Valida cada parámetro que declara un esquema: @Body({ schema: X }), @Query({ schema: X }),
 * @Param('id', { schema: Id }). Devuelve el valor ya transformado por Zod (trim, mayúsculas,
 * defaults) y, si falla, un error VALIDATION con un mensaje por campo.
 */
export const validationPipe = new StandardSchemaValidationPipe({
  exceptionFactory: (issues: Issues) =>
    new AppError('VALIDATION', undefined, { fieldErrors: toFieldErrors(issues) }),
});

function toFieldErrors(issues: Issues): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.map((s) => String(typeof s === 'object' ? s.key : s)).join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

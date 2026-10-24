import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('http');

/**
 * Primer paso de toda petición: le asigna un requestId (el de Vercel si existe), lo devuelve en
 * la cabecera x-request-id y escribe una sola línea de log al terminar. El detalle de negocio
 * de esa misma petición se busca en audit_events por requestId.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const started = performance.now();
  req.requestId = req.header('x-vercel-id') ?? randomUUID();
  res.setHeader('x-request-id', req.requestId);
  res.setHeader('x-content-type-options', 'nosniff');

  res.on('finish', () => {
    const line = {
      requestId: req.requestId,
      method: req.method,
      route: (req.route as { path?: string } | undefined)?.path ?? req.path,
      status: res.statusCode,
      ms: Math.round(performance.now() - started),
      actor: req.session?.actor,
      code: res.locals.errorCode,
    };
    if (res.statusCode >= 500) logger.error(line);
    else logger.log(line);
  });

  next();
}

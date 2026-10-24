import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@mimark/contracts/session';
import type { Request } from 'express';

/**
 * Quién hace la petición. El controller lo arma con @Ctx() y lo pasa explícito al service:
 * nada de contexto implícito.
 */
export interface Ctx {
  actor: string;
  role: Role;
  requestId: string;
}

export const Ctx = createParamDecorator((_: unknown, context: ExecutionContext): Ctx => {
  const req = context.switchToHttp().getRequest<Request>();
  if (!req.session) {
    throw new Error('@Ctx() solo funciona en rutas protegidas; en rutas @Public() usa @ReqInfo()');
  }
  return { actor: req.session.actor, role: req.session.role, requestId: req.requestId };
});

/** Datos de la petición para rutas públicas (sin sesión). */
export interface ReqInfo {
  requestId: string;
  ip: string;
}

export const ReqInfo = createParamDecorator((_: unknown, context: ExecutionContext): ReqInfo => {
  const req = context.switchToHttp().getRequest<Request>();
  return { requestId: req.requestId, ip: clientIp(req) };
});

/** Vercel pone la IP del cliente en x-real-ip; en local viene del socket. */
function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return req.header('x-real-ip') ?? forwarded ?? req.socket.remoteAddress ?? 'desconocida';
}

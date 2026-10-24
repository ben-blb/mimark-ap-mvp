import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/app-error.js';
import { env } from '../../config/env.js';
import { readSession } from './session.rules.js';

export const SESSION_COOKIE = 'mimark_session';

const IS_PUBLIC = 'isPublic';

/** Marca una ruta como pública. Todo lo demás exige sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Guard global: lee la cookie firmada y deja la sesión en req.session. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const session = readSession(readCookie(req, SESSION_COOKIE), env.SESSION_SECRET, new Date());
    if (session) req.session = session;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || session) return true;
    throw new AppError('UNAUTHENTICATED');
  }
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.header('cookie')?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

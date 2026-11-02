import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CookieOptions, Request } from 'express';
import { can, type Permission } from '@mimark/contracts/permissions';
import { AppError } from '../../common/app-error.js';
import { env } from '../../config/env.js';
import { readSession } from './session.rules.js';

export const SESSION_COOKIE = 'mimark_session';

export function sessionCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
}

const IS_PUBLIC = 'isPublic';
const REQUIRES = 'requiresPermission';
const ALLOW_PASSWORD_CHANGE = 'allowPasswordChange';

/** Marca una ruta como pública. Todo lo demás exige sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** La ruta exige este permiso del rol de la sesión (spec 013). Sin él, basta con tener sesión. */
export const Requires = (permission: Permission) => SetMetadata(REQUIRES, permission);

/** La ruta sigue disponible mientras la persona debe cambiar su contraseña (AC-013-11). */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE, true);

/**
 * Guard global: lee la cookie firmada, deja la sesión en req.session y aplica, en este orden:
 * 401 sin sesión · 403 PASSWORD_CHANGE_REQUIRED · 403 FORBIDDEN si el rol no tiene el permiso.
 * No consulta la base de datos: el rol y el estado rigen hasta que la cookie venza (spec 013).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const session = readSession(readCookie(req, SESSION_COOKIE), env.SESSION_SECRET, new Date());
    if (session) req.session = session;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;
    if (!session) throw new AppError('UNAUTHENTICATED');

    const allowsPasswordChange = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PASSWORD_CHANGE,
      targets,
    );
    if (session.mustChangePassword && !allowsPasswordChange) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED');
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRES, targets);
    if (permission && !can(session.role, permission)) throw new AppError('FORBIDDEN');
    return true;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.header('cookie')?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

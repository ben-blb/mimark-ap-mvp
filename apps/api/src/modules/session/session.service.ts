import { Injectable } from '@nestjs/common';
import type { LoginInput, SessionDto } from '@mimark/contracts/session';
import { AppError } from '../../common/app-error.js';
import type { ReqInfo } from '../../common/ctx.js';
import { env } from '../../config/env.js';
import { AuditRepository } from '../audit/audit.repository.js';
import {
  FAILED_LOGIN_WINDOW_MS,
  isLoginBlocked,
  type Session,
  sessionExpiry,
  signSession,
  verifyAccessCode,
} from './session.rules.js';

@Injectable()
export class SessionService {
  constructor(private readonly audit: AuditRepository) {}

  /** Valida el código de acceso y emite el token de la cookie. */
  async login(input: LoginInput, info: ReqInfo): Promise<{ token: string; session: SessionDto }> {
    const now = new Date();
    const since = new Date(now.getTime() - FAILED_LOGIN_WINDOW_MS);
    const failures = await this.audit.countFailedLogins(info.ip, since);
    if (isLoginBlocked(failures)) throw new AppError('RATE_LIMITED');

    if (!verifyAccessCode(input.code, env.ACCESS_CODE_HASH)) {
      await this.audit.log({
        actor: input.name,
        role: input.role,
        requestId: info.requestId,
        entity: 'session',
        action: 'session.failed',
        data: { ip: info.ip },
      });
      throw new AppError('ACCESS_DENIED');
    }

    const session: Session = { actor: input.name, role: input.role, expiresAt: sessionExpiry(now) };
    await this.audit.log({
      actor: session.actor,
      role: session.role,
      requestId: info.requestId,
      entity: 'session',
      action: 'session.started',
    });
    return { token: signSession(session, env.SESSION_SECRET), session: toSessionDto(session) };
  }
}

export function toSessionDto(session: Session): SessionDto {
  return { actor: session.actor, role: session.role, expiresAt: session.expiresAt.toISOString() };
}

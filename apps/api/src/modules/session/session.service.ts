import { Injectable } from '@nestjs/common';
import type { ChangePasswordInput, LoginInput, SessionDto } from '@mimark/contracts/session';
import { AppError } from '../../common/app-error.js';
import type { ReqInfo } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { env } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import {
  FAILED_LOGIN_WINDOW_MS,
  hashSecret,
  isLoginBlocked,
  type Session,
  sessionExpiry,
  signSession,
  toSessionDto,
  verifySecret,
} from './session.rules.js';

// Para tardar lo mismo cuando el correo no existe (AC-013-06): se verifica contra un hash cualquiera.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= hashSecret('contrasena-que-nadie-usa'));

@Injectable()
export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly users: UsersRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** Valida correo y contraseña y emite el token de la cookie. */
  async login(input: LoginInput, info: ReqInfo): Promise<{ token: string; session: SessionDto }> {
    const now = new Date();
    await this.assertNotBlocked(input.email, info.ip, now);

    const user = await this.users.findByEmail(input.email);
    const passwordOk = verifySecret(input.password, user?.passwordHash ?? getDummyHash());
    if (!user || !user.active || !passwordOk) {
      await this.logFailure(input.email, info);
      throw new AppError('ACCESS_DENIED');
    }

    await this.audit.log({
      actor: user.name,
      role: user.role,
      requestId: info.requestId,
      entity: 'session',
      entityId: user.id,
      action: 'session.started',
    });
    return this.issue(user, now);
  }

  /** Cambia la contraseña de la sesión actual y emite una cookie nueva (AC-013-12). */
  async changePassword(
    session: { userId: string },
    input: ChangePasswordInput,
    info: ReqInfo,
  ): Promise<{ token: string; session: SessionDto }> {
    const user = await this.users.findById(session.userId);
    if (!user || !user.active) throw new AppError('UNAUTHENTICATED');

    const now = new Date();
    await this.assertNotBlocked(user.email, info.ip, now);
    if (!verifySecret(input.currentPassword, user.passwordHash)) {
      await this.logFailure(user.email, info);
      throw new AppError('ACCESS_DENIED');
    }
    if (input.newPassword === input.currentPassword) {
      throw new AppError('VALIDATION', undefined, {
        fieldErrors: { newPassword: 'La contraseña nueva debe ser distinta de la actual' },
      });
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await this.users.setPassword(user.id, hashSecret(input.newPassword), false, tx);
      await this.audit.log(
        {
          actor: user.name,
          role: user.role,
          requestId: info.requestId,
          entity: 'user',
          entityId: user.id,
          action: 'user.password_changed',
        },
        tx,
      );
      return row;
    });
    return this.issue(updated, now);
  }

  private async assertNotBlocked(email: string, ip: string, now: Date): Promise<void> {
    const since = new Date(now.getTime() - FAILED_LOGIN_WINDOW_MS);
    const [byIp, byEmail] = await Promise.all([
      this.audit.countFailedLogins(ip, since),
      this.audit.countFailedLoginsByEmail(email, since),
    ]);
    if (isLoginBlocked(byIp, byEmail)) throw new AppError('RATE_LIMITED');
  }

  private logFailure(email: string, info: ReqInfo): Promise<void> {
    return this.audit.log({
      actor: email,
      requestId: info.requestId,
      entity: 'session',
      action: 'session.failed',
      data: { ip: info.ip, email },
    });
  }

  private issue(user: User, now: Date): { token: string; session: SessionDto } {
    const session: Session = {
      userId: user.id,
      actor: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      expiresAt: sessionExpiry(now),
    };
    return { token: signSession(session, env.SESSION_SECRET), session: toSessionDto(session) };
  }
}

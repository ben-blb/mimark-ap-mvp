import { Injectable } from '@nestjs/common';
import type { SessionDto, SetupInput, SetupStatus } from '@mimark/contracts/session';
import { AppError } from '../../common/app-error.js';
import type { ReqInfo } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { env } from '../../config/env.js';
import { AuditRepository } from '../audit/audit.repository.js';
import {
  FAILED_LOGIN_WINDOW_MS,
  isLoginBlocked,
  hashSecret,
  type Session,
  sessionExpiry,
  signSession,
  toSessionDto,
  verifySecret,
} from '../session/session.rules.js';
import { UsersRepository } from './users.repository.js';

/** Configuración inicial (spec 013): crea al primer administrador, una sola vez y con el código de configuración. */
@Injectable()
export class SetupService {
  constructor(
    private readonly db: Db,
    private readonly users: UsersRepository,
    private readonly audit: AuditRepository,
  ) {}

  async status(): Promise<SetupStatus> {
    return { needsSetup: (await this.users.count()) === 0 };
  }

  async setup(input: SetupInput, info: ReqInfo): Promise<{ token: string; session: SessionDto }> {
    if ((await this.users.count()) > 0) throw new AppError('SETUP_DONE');

    const now = new Date();
    const since = new Date(now.getTime() - FAILED_LOGIN_WINDOW_MS);
    if (isLoginBlocked(await this.audit.countFailedLogins(info.ip, since))) {
      throw new AppError('RATE_LIMITED');
    }
    if (!verifySecret(input.code, env.ACCESS_CODE_HASH)) {
      await this.audit.log({
        actor: input.email,
        requestId: info.requestId,
        entity: 'session',
        action: 'session.failed',
        data: { ip: info.ip, email: input.email },
      });
      throw new AppError('ACCESS_DENIED', 'El código de configuración no es correcto.');
    }

    const passwordHash = hashSecret(input.password);
    const user = await this.db.$transaction(async (tx) => {
      await this.users.lockSetup(tx);
      if ((await this.users.count(tx)) > 0) throw new AppError('SETUP_DONE');
      const created = await this.users.create(
        {
          name: input.name,
          email: input.email,
          role: 'admin',
          passwordHash,
          mustChangePassword: false,
        },
        tx,
      );
      const who = { actor: created.name, role: created.role, requestId: info.requestId };
      await this.audit.log(
        {
          ...who,
          entity: 'user',
          entityId: created.id,
          action: 'user.created',
          data: { setup: true, after: { name: created.name, email: created.email, role: 'admin' } },
        },
        tx,
      );
      await this.audit.log(
        { ...who, entity: 'session', entityId: created.id, action: 'session.started' },
        tx,
      );
      return created;
    });

    const session: Session = {
      userId: user.id,
      actor: user.name,
      role: user.role,
      mustChangePassword: false,
      expiresAt: sessionExpiry(now),
    };
    return { token: signSession(session, env.SESSION_SECRET), session: toSessionDto(session) };
  }
}

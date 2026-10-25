import { Injectable } from '@nestjs/common';
import { Db, type Tx } from '../../common/db.js';
import type { AuditEvent, Prisma } from '../../generated/prisma/client.js';

export interface AuditEntry {
  actor: string;
  role?: string | null;
  requestId: string;
  entity: string;
  entityId?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  data?: Prisma.InputJsonValue;
}

/** Única puerta a audit_events. Se escribe desde cualquier módulo; nunca se edita ni se borra. */
@Injectable()
export class AuditRepository {
  constructor(private readonly db: Db) {}

  /** Pasa `tx` para que el evento se guarde en la misma transacción que el cambio. */
  async log(entry: AuditEntry, tx: Tx = this.db): Promise<void> {
    await tx.auditEvent.create({ data: entry });
  }

  listFor(entity: string, entityId: string): Promise<AuditEvent[]> {
    return this.db.auditEvent.findMany({
      where: { entity, entityId },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    });
  }

  /** Cuenta eventos de una acción desde un instante, opcionalmente de un solo actor (cuotas de uso). */
  countSince(filter: { action: string; actor?: string; since: Date }): Promise<number> {
    return this.db.auditEvent.count({
      where: {
        action: filter.action,
        at: { gte: filter.since },
        ...(filter.actor && { actor: filter.actor }),
      },
    });
  }

  countFailedLogins(ip: string, since: Date): Promise<number> {
    return this.db.auditEvent.count({
      where: { action: 'session.failed', at: { gte: since }, data: { path: ['ip'], equals: ip } },
    });
  }
}

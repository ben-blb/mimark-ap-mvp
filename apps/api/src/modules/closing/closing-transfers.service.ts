import { Injectable } from '@nestjs/common';
import type { CreateTransferInput, TransferDto } from '@mimark/contracts/closing-review';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { TRANSFER_OPTIONS } from './cantaloupe.assumptions.js';
import { canPair } from './closing-checks.rules.js';
import { toTransferEntry } from './closing-review.dto.js';
import { ClosingUploadsRepository } from './closing-uploads.repository.js';

/** Traspasos entre cuentas propias: una persona confirma lo que las reglas proponen (spec 023). */
@Injectable()
export class ClosingTransfersService {
  constructor(
    private readonly db: Db,
    private readonly ledger: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** AC-023-07 y 08. */
  create(input: CreateTransferInput, ctx: Ctx): Promise<TransferDto> {
    const [idA, idB] = input.entryIds;
    if (idA === idB) {
      throw new AppError('VALIDATION', undefined, {
        fieldErrors: { entryIds: 'Elige dos movimientos distintos' },
      });
    }
    return this.db.$transaction(async (tx) => {
      const first = await this.ledger.findEntry(idA, tx);
      const second = await this.ledger.findEntry(idB, tx);
      if (!first || !second) throw new AppError('NOT_FOUND', 'No existe ese movimiento.');
      if (first.periodId !== second.periodId) {
        throw new AppError('VALIDATION', undefined, {
          fieldErrors: { entryIds: 'Los dos movimientos deben ser del mismo periodo' },
        });
      }
      await this.ledger.lockOpenPeriod(first.periodId, tx);

      // Con el periodo bloqueado, el estado ya no cambia debajo de nosotros.
      const a = (await this.ledger.findEntry(idA, tx)) ?? first;
      const b = (await this.ledger.findEntry(idB, tx)) ?? second;
      if (a.transferGroupId || b.transferGroupId) throw new AppError('ALREADY_PAIRED');
      if (!canPair(toTransferEntry(a), toTransferEntry(b), TRANSFER_OPTIONS)) {
        throw new AppError('VALIDATION', undefined, {
          fieldErrors: {
            entryIds:
              'No son los dos lados de un traspaso: deben ser de bancos, de cuentas distintas, con el mismo monto, signos opuestos y hasta 2 días hábiles de diferencia',
          },
        });
      }

      const id = await this.ledger.pairEntries([idA, idB], ctx.actor, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'transfer',
          entityId: id,
          action: 'transfer.confirmed',
          data: { entryIds: [idA, idB] },
        },
        tx,
      );
      return { id, entryIds: [idA, idB] };
    });
  }

  /** AC-023-07: desemparejar devuelve los dos movimientos a la cola. */
  remove(id: string, ctx: Ctx): Promise<TransferDto> {
    return this.db.$transaction(async (tx) => {
      const group = await this.ledger.findTransferGroup(id, tx);
      const first = group?.entries[0];
      if (!group || !first) throw new AppError('NOT_FOUND', 'No existe ese traspaso.');
      await this.ledger.lockOpenPeriod(first.periodId, tx);

      const entryIds = group.entries.map((e) => e.id) as [string, string];
      await this.ledger.unpairGroup(id, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'transfer',
          entityId: id,
          action: 'transfer.unpaired',
          data: { entryIds },
        },
        tx,
      );
      return { id, entryIds };
    });
  }
}

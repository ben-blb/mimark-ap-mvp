import { Injectable } from '@nestjs/common';
import type {
  CreateEntryInput,
  EntryList,
  EntryListQuery,
  LedgerEntryDto,
} from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { ClosingRepository } from './closing.repository.js';
import { ClosingUploadsRepository } from './closing-uploads.repository.js';
import { toEntryDto } from './closing-uploads.dto.js';

/** La nómina es siempre un egreso (como su archivo); en caja el signo lo decide quien captura. */
const signedAmount = (input: CreateEntryInput) =>
  input.source === 'payroll' ? `-${input.amount.replace(/^-/, '')}` : input.amount;

/** Movimientos del cierre (spec 021): captura manual de caja y nómina, y el listado paginado. */
@Injectable()
export class ClosingEntriesService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly uploads: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async create(input: CreateEntryInput, ctx: Ctx): Promise<LedgerEntryDto> {
    if (!(await this.closing.findCompany(input.companyId))) {
      throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    }
    if (input.kioskId) {
      const kiosk = await this.closing.findKiosk(input.kioskId);
      if (kiosk?.companyId !== input.companyId) {
        throw new AppError('VALIDATION', undefined, {
          fieldErrors: { kioskId: 'El kiosko no es de esta empresa' },
        });
      }
    }
    const month = input.date.slice(0, 7);
    const amount = signedAmount(input);

    return this.db.$transaction(async (tx) => {
      const period = await this.uploads.lockPeriod(
        (await this.uploads.ensurePeriod(input.companyId, month, tx)).id,
        tx,
      );
      if (period.status === 'closed') throw new AppError('PERIOD_CLOSED');
      const entry = await this.uploads.createEntry(
        {
          periodId: period.id,
          date: new Date(input.date),
          kioskId: input.kioskId ?? null,
          accountId: null,
          source: input.source,
          uploadId: null,
          rowNumber: null,
          concept: input.concept,
          amount,
          needsReview: false,
          createdBy: ctx.actor,
        },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'entry',
          entityId: entry.id,
          action: 'entry.created',
          data: { source: input.source, month, amount },
        },
        tx,
      );
      return toEntryDto(entry);
    });
  }

  async list(query: EntryListQuery): Promise<EntryList> {
    const { items, total } = await this.uploads.listEntries(query, query.page, query.pageSize);
    return { items: items.map(toEntryDto), total, page: query.page, pageSize: query.pageSize };
  }
}

import { Injectable } from '@nestjs/common';
import type {
  CantaloupeList,
  CheckList,
  PeriodDto,
  ReopenInput,
} from '@mimark/contracts/closing-review';
import { BankDraftData } from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, type Tx } from '../../common/db.js';
import { fromDbDate } from '../../common/dates.js';
import { centsToMoney } from '../../common/money.js';
import type { ReportPeriod } from '../../generated/prisma/client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import {
  BANK_BUSINESS_DAYS,
  CANTALOUPE_TOLERANCE_CENTS,
  CANTALOUPE_VAT_BP,
} from './cantaloupe.assumptions.js';
import { rateToBp, reconcileDays } from './cantaloupe.rules.js';
import {
  canClose,
  CANTALOUPE_COLLECTION_CODE,
  isBankSource,
  runChecks,
  signedMoneyToCents,
  type BankStatement,
  type CheckEntry,
} from './closing-checks.rules.js';
import { toPeriodDto } from './closing-review.dto.js';
import { ClosingUploadsRepository, type EntryWithCategory } from './closing-uploads.repository.js';
import { ClosingRepository } from './closing.repository.js';

const cents = (e: EntryWithCategory) => Math.round(Number(e.amount) * 100);

/** Conciliación de Cantaloupe, cuadres y cierre del periodo (spec 023). */
@Injectable()
export class ClosingChecksService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly ledger: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** AC-023-09 a 11. */
  async cantaloupe(periodId: string): Promise<CantaloupeList> {
    const period = await this.requirePeriod(periodId);
    const company = await this.closing.findCompany(period.companyId);
    if (!company) throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    const entries = await this.ledger.listPeriodEntries(period.id);

    const day = (e: EntryWithCategory) => ({ date: fromDbDate(e.date), cents: cents(e) });
    const rate = company.cantaloupeRate.toFixed(4);
    const rows = reconcileDays(
      entries.filter((e) => e.source === 'cantaloupe').map(day),
      entries
        .filter((e) => isBankSource(e.source) && e.category?.code === CANTALOUPE_COLLECTION_CODE)
        .map(day),
      {
        rateBp: rateToBp(rate),
        vatBp: CANTALOUPE_VAT_BP,
        toleranceCents: CANTALOUPE_TOLERANCE_CENTS,
        businessDays: BANK_BUSINESS_DAYS,
      },
    );
    return {
      rate,
      items: rows.map((r) => ({
        date: r.date,
        groupedDays: r.groupedDays,
        sales: centsToMoney(r.sales),
        commission: centsToMoney(r.commission),
        vat: centsToMoney(r.vat),
        expected: centsToMoney(r.expected),
        deposit: centsToMoney(r.deposit),
        difference: centsToMoney(r.difference),
        status: r.status,
      })),
    };
  }

  /** AC-023-12 y 13. */
  async checks(periodId: string): Promise<CheckList> {
    const period = await this.requirePeriod(periodId);
    return { items: await this.runChecksFor(period) };
  }

  /** AC-023-14: cerrar exige cero errores y cero movimientos por revisar. */
  close(periodId: string, ctx: Ctx): Promise<PeriodDto> {
    return this.db.$transaction(async (tx) => {
      const locked = await this.ledger.lockOpenPeriod(periodId, tx);
      const checks = await this.runChecksFor(locked, tx);
      const pendingReview = await this.ledger.countNeedsReview(periodId, tx);
      const verdict = canClose(checks, pendingReview);
      if (!verdict.allowed) {
        throw new AppError('CLOSE_BLOCKED', undefined, {
          details: { errors: verdict.errors, pendingReview },
        });
      }
      const period = await this.ledger.closePeriod(periodId, ctx.actor, new Date(), tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'period',
          entityId: periodId,
          action: 'period.closed',
          fromStatus: 'open',
          toStatus: 'closed',
          data: { month: period.month },
        },
        tx,
      );
      return toPeriodDto(period);
    });
  }

  /** AC-023-15: reabrir exige un motivo y queda en auditoría. */
  reopen(periodId: string, input: ReopenInput, ctx: Ctx): Promise<PeriodDto> {
    return this.db.$transaction(async (tx) => {
      if (!(await this.ledger.findPeriodById(periodId, tx))) {
        throw new AppError('NOT_FOUND', 'No existe ese periodo.');
      }
      await this.ledger.lockPeriod(periodId, tx);
      const period = await this.ledger.reopenPeriod(periodId, input.reason, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'period',
          entityId: periodId,
          action: 'period.reopened',
          fromStatus: 'closed',
          toStatus: 'open',
          data: { reason: input.reason },
        },
        tx,
      );
      return toPeriodDto(period);
    });
  }

  private async requirePeriod(id: string): Promise<ReportPeriod> {
    const period = await this.ledger.findPeriodById(id);
    if (!period) throw new AppError('NOT_FOUND', 'No existe ese periodo.');
    return period;
  }

  private async runChecksFor(period: ReportPeriod, tx?: Tx) {
    const [entries, allAccounts] = await Promise.all([
      this.ledger.listPeriodEntries(period.id, {}, tx),
      this.closing.listAccounts(true, tx),
    ]);
    const accounts = allAccounts.filter((a) => a.companyId === period.companyId);
    const statements: BankStatement[] = [];
    for (const account of accounts) {
      const draft = await this.ledger.findConfirmedBankDraft(
        period.companyId,
        period.month,
        account.id,
        tx,
      );
      const parsed = draft ? BankDraftData.safeParse(draft) : null;
      if (parsed?.success) {
        statements.push({
          accountId: account.id,
          openingCents: signedMoneyToCents(parsed.data.openingBalance),
          closingCents: signedMoneyToCents(parsed.data.closingBalance),
        });
      }
    }
    const checkEntries: CheckEntry[] = entries.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      source: e.source,
      amountCents: cents(e),
      categoryCode: e.category?.code ?? null,
      kind: e.kind,
      uploadId: e.uploadId,
      rowNumber: e.rowNumber,
    }));
    return runChecks({ entries: checkEntries, accounts, statements });
  }
}

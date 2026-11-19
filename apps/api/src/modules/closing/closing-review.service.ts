import { Injectable } from '@nestjs/common';
import type {
  ClassifyAndRuleInput,
  ClassifyAndRuleResult,
  ClassifyEntryInput,
  ClassifyResultDto,
  PeriodList,
  PeriodQuery,
  ReviewList,
  ReviewQuery,
} from '@mimark/contracts/closing-review';
import type { LedgerEntryDto } from '@mimark/contracts/closing-uploads';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, type Tx } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { TRANSFER_OPTIONS } from './cantaloupe.assumptions.js';
import { categoryForSource, isRuleSource, proposeTransfers } from './closing-checks.rules.js';
import { toPeriodDto, toTransferEntry } from './closing-review.dto.js';
import { toEntryDto } from './closing-uploads.dto.js';
import { ClosingUploadsRepository, type EntryWithCategory } from './closing-uploads.repository.js';
import { ClosingRepository } from './closing.repository.js';
import { matchRule, normalizeKey, suggestRule } from './closing.rules.js';

const KIOSK_SOURCES = ['parlevel_sales', 'parlevel_waste'];

/** Clasificación de los movimientos del periodo y la cola «Por revisar» (spec 023). */
@Injectable()
export class ClosingReviewService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly ledger: ClosingUploadsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async listPeriods(query: PeriodQuery): Promise<PeriodList> {
    const period = await this.ledger.findPeriod(query.companyId, query.month);
    return { items: period ? [toPeriodDto(period)] : [] };
  }

  /** AC-023-01: reglas y fuentes sobre lo que no tiene categoría; idempotente y sin pisar lo hecho a mano. */
  classify(periodId: string, ctx: Ctx): Promise<ClassifyResultDto> {
    return this.db.$transaction(async (tx) => {
      const period = await this.ledger.lockOpenPeriod(periodId, tx);
      const [rules, categories] = await Promise.all([
        this.closing.listRules(false),
        this.closing.listCategories(),
      ]);
      const categoryIdByCode = new Map(categories.map((c) => [c.code, c.id]));
      const pending = await this.ledger.listPeriodEntries(
        period.id,
        { categoryId: null, kind: 'normal' },
        tx,
      );

      // categoría → { apaga la cola, la deja como está }
      const assign = new Map<string, { off: string[]; keep: string[] }>();
      const toReview: string[] = [];
      const put = (categoryId: string, id: string, off: boolean) => {
        const bucket = assign.get(categoryId) ?? { off: [], keep: [] };
        bucket[off ? 'off' : 'keep'].push(id);
        assign.set(categoryId, bucket);
      };

      for (const entry of pending) {
        const code = categoryForSource({
          source: entry.source,
          meta: entry.meta as Record<string, unknown> | null,
        });
        const fixed = code ? categoryIdByCode.get(code) : undefined;
        if (fixed) {
          put(fixed, entry.id, false);
        } else if (isRuleSource(entry.source)) {
          const rule = matchRule(entry.concept, rules);
          if (rule) put(rule.categoryId, entry.id, true);
          else if (!entry.needsReview) toReview.push(entry.id);
        }
      }

      let classified = 0;
      for (const [categoryId, { off, keep }] of assign) {
        await this.ledger.setCategory(off, categoryId, false, tx);
        await this.ledger.setCategory(keep, categoryId, undefined, tx);
        classified += off.length + keep.length;
      }
      await this.ledger.markNeedsReview(toReview, tx);

      const needsReview = await this.ledger.countNeedsReview(period.id, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'period',
          entityId: period.id,
          action: 'period.classified',
          data: { classified, needsReview },
        },
        tx,
      );
      return { classified, needsReview };
    });
  }

  /** AC-023-02: la cola, con la sugerencia de regla y los traspasos propuestos. */
  async review(query: ReviewQuery): Promise<ReviewList> {
    const period = await this.ledger.findPeriodById(query.periodId);
    if (!period) throw new AppError('NOT_FOUND', 'No existe ese periodo.');
    const [queue, rules] = await Promise.all([
      this.ledger.listPeriodEntries(period.id, { needsReview: true }),
      this.closing.listRules(false),
    ]);

    const pool = queue.filter(
      (e) => e.kind === 'normal' && e.categoryId === null && e.transferGroupId === null,
    );
    const partner = new Map<string, string>();
    const transfers = proposeTransfers(pool.map(toTransferEntry), TRANSFER_OPTIONS).map(
      ([a, b]) => {
        partner.set(a, b);
        partner.set(b, a);
        return { entryIds: [a, b] as [string, string] };
      },
    );

    const items = queue
      .filter((e) => (query.source ? e.source === query.source : true))
      .filter((e) => (query.accountId ? e.accountId === query.accountId : true))
      .map((e) => ({
        ...toEntryDto(e),
        reason: (KIOSK_SOURCES.includes(e.source) && e.kioskId === null
          ? 'unknown_kiosk'
          : 'no_rule') as 'unknown_kiosk' | 'no_rule',
        suggestedCategoryId:
          e.categoryId === null ? (suggestRule(e.concept, rules)?.categoryId ?? null) : null,
        possibleTransferWith: partner.get(e.id) ?? null,
      }));
    return { items, transfers };
  }

  /** AC-023-03: clasificación manual de un movimiento. */
  classifyEntry(id: string, input: ClassifyEntryInput, ctx: Ctx): Promise<LedgerEntryDto> {
    return this.db.$transaction(async (tx) => {
      const entry = await this.editableEntry(id, tx);
      await this.requireUsableCategory(input.categoryId, tx);
      await this.ledger.setCategory([id], input.categoryId, false, tx);
      await this.logClassified(entry, input.categoryId, ctx, tx);
      return toEntryDto((await this.ledger.findEntry(id, tx)) ?? entry);
    });
  }

  /** AC-023-04: clasifica, crea la regla y reclasifica lo que la regla nueva reconoce, todo en una transacción. */
  classifyAndRule(
    id: string,
    input: ClassifyAndRuleInput,
    ctx: Ctx,
  ): Promise<ClassifyAndRuleResult> {
    return this.db.$transaction(async (tx) => {
      const entry = await this.editableEntry(id, tx);
      await this.requireUsableCategory(input.categoryId, tx);
      const patternKey = normalizeKey(input.pattern);
      if (!normalizeKey(entry.concept).includes(patternKey)) {
        throw new AppError('VALIDATION', undefined, {
          fieldErrors: { pattern: 'El patrón debe aparecer en el concepto del movimiento' },
        });
      }

      const rule = await this.closing.createRule(
        { pattern: input.pattern, categoryId: input.categoryId, priority: 0, patternKey },
        tx,
      );
      await this.audit.log(
        {
          ...ctx,
          entity: 'rule',
          entityId: rule.id,
          action: 'rule.created',
          data: { after: { pattern: input.pattern, categoryId: input.categoryId }, entryId: id },
        },
        tx,
      );
      await this.ledger.setCategory([id], input.categoryId, false, tx);
      await this.logClassified(entry, input.categoryId, ctx, tx);

      const rules = await this.closing.listRules(false, tx);
      const others = await this.ledger.listPeriodEntries(
        entry.periodId,
        { needsReview: true, categoryId: null, kind: 'normal', id: { not: id } },
        tx,
      );
      const byCategory = new Map<string, string[]>();
      for (const other of others) {
        if (!isRuleSource(other.source)) continue;
        const match = matchRule(other.concept, rules);
        if (match)
          byCategory.set(match.categoryId, [...(byCategory.get(match.categoryId) ?? []), other.id]);
      }
      let reclassified = 0;
      for (const [categoryId, ids] of byCategory) {
        await this.ledger.setCategory(ids, categoryId, false, tx);
        reclassified += ids.length;
      }
      if (reclassified > 0) {
        await this.audit.log(
          {
            ...ctx,
            entity: 'period',
            entityId: entry.periodId,
            action: 'period.classified',
            data: { classified: reclassified, ruleId: rule.id },
          },
          tx,
        );
      }
      return {
        entry: toEntryDto((await this.ledger.findEntry(id, tx)) ?? entry),
        ruleId: rule.id,
        reclassified,
      };
    });
  }

  // Validaciones compartidas
  /** El movimiento, con su periodo abierto y bloqueado, listo para clasificarse a mano. */
  private async editableEntry(id: string, tx: Tx): Promise<EntryWithCategory> {
    const found = await this.ledger.findEntry(id, tx);
    if (!found) throw new AppError('NOT_FOUND', 'No existe ese movimiento.');
    await this.ledger.lockOpenPeriod(found.periodId, tx);
    const entry = (await this.ledger.findEntry(id, tx)) ?? found;
    if (entry.kind === 'internal_transfer') throw new AppError('ALREADY_PAIRED');
    if (entry.source === 'cantaloupe') {
      throw new AppError('VALIDATION', undefined, {
        fieldErrors: { categoryId: 'Las ventas de Cantaloupe solo concilian: no llevan categoría' },
      });
    }
    return entry;
  }

  private async requireUsableCategory(categoryId: string, tx: Tx): Promise<void> {
    const category = await this.closing.findCategory(categoryId, tx);
    if (!category) throw new AppError('NOT_FOUND', 'No existe esa categoría.');
    if (!category.active) {
      throw new AppError('VALIDATION', undefined, {
        fieldErrors: { categoryId: 'La categoría está desactivada' },
      });
    }
  }

  private logClassified(
    entry: EntryWithCategory,
    categoryId: string,
    ctx: Ctx,
    tx: Tx,
  ): Promise<void> {
    return this.audit.log(
      {
        ...ctx,
        entity: 'entry',
        entityId: entry.id,
        action: 'entry.classified',
        data: { from: entry.categoryId, to: categoryId },
      },
      tx,
    );
  }
}

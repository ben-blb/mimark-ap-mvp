import { z } from 'zod';
import { Id, LocalDate, listOf } from './common.js';
import { LedgerEntryDto, Month, SignedMoney } from './closing-uploads.js';

/** Clasificación, conciliación y cuadres del cierre (spec 023). */

export const PERIOD_STATUSES = ['open', 'closed'] as const;
export const PeriodStatus = z.enum(PERIOD_STATUSES);
export type PeriodStatus = z.infer<typeof PeriodStatus>;

export const PeriodDto = z.object({
  id: Id,
  companyId: Id,
  month: Month,
  status: PeriodStatus,
  closedBy: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
  reopenReason: z.string().nullable(),
});
export type PeriodDto = z.infer<typeof PeriodDto>;
export const PeriodQuery = z.object({ companyId: Id, month: Month });
export type PeriodQuery = z.infer<typeof PeriodQuery>;
export const PeriodList = listOf(PeriodDto);
export type PeriodList = z.infer<typeof PeriodList>;

// Clasificación
export const ClassifyResultDto = z.object({
  /** Movimientos que recibieron categoría en esta corrida. */
  classified: z.number().int(),
  /** Movimientos que siguen en la cola «Por revisar» (con o sin esta corrida). */
  needsReview: z.number().int(),
});
export type ClassifyResultDto = z.infer<typeof ClassifyResultDto>;

export const ReviewQuery = z.object({
  periodId: Id,
  source: z.enum(['parlevel_sales', 'parlevel_waste', 'bank_csv', 'bank_pdf', 'cash']).optional(),
  accountId: Id.optional(),
});
export type ReviewQuery = z.infer<typeof ReviewQuery>;

/** Por qué un movimiento está en la cola. */
export const REVIEW_REASONS = ['unknown_kiosk', 'no_rule'] as const;
export const ReviewReason = z.enum(REVIEW_REASONS);
export type ReviewReason = z.infer<typeof ReviewReason>;

export const ReviewItemDto = LedgerEntryDto.extend({
  reason: ReviewReason,
  /** Categoría de la regla que más se parece al concepto, si hay. Solo una sugerencia. */
  suggestedCategoryId: Id.nullable(),
  /** El otro lado de un traspaso propuesto, para confirmarlos juntos. */
  possibleTransferWith: Id.nullable(),
});
export type ReviewItemDto = z.infer<typeof ReviewItemDto>;

export const TransferProposalDto = z.object({ entryIds: z.tuple([Id, Id]) });
export type TransferProposalDto = z.infer<typeof TransferProposalDto>;

export const ReviewList = z.object({
  items: z.array(ReviewItemDto),
  transfers: z.array(TransferProposalDto),
});
export type ReviewList = z.infer<typeof ReviewList>;

export const ClassifyEntryInput = z.object({ categoryId: Id });
export type ClassifyEntryInput = z.infer<typeof ClassifyEntryInput>;

export const ClassifyAndRuleInput = z.object({
  categoryId: Id,
  pattern: z
    .string()
    .trim()
    .min(3, 'Escribe al menos 3 caracteres')
    .max(200, 'Máximo 200 caracteres'),
});
export type ClassifyAndRuleInput = z.infer<typeof ClassifyAndRuleInput>;

export const ClassifyAndRuleResult = z.object({
  entry: LedgerEntryDto,
  ruleId: Id,
  /** Otros movimientos en revisión del periodo que la regla nueva clasificó. */
  reclassified: z.number().int(),
});
export type ClassifyAndRuleResult = z.infer<typeof ClassifyAndRuleResult>;

// Traspasos
export const CreateTransferInput = z.object({ entryIds: z.tuple([Id, Id]) });
export type CreateTransferInput = z.infer<typeof CreateTransferInput>;
export const TransferDto = z.object({ id: Id, entryIds: z.tuple([Id, Id]) });
export type TransferDto = z.infer<typeof TransferDto>;

// Conciliación Cantaloupe vs banco
export const CANTALOUPE_STATUSES = ['ok', 'warning', 'missing', 'orphan'] as const;
export const CantaloupeStatus = z.enum(CANTALOUPE_STATUSES);
export type CantaloupeStatus = z.infer<typeof CantaloupeStatus>;

export const CantaloupeDayDto = z.object({
  /** Día del depósito esperado (un lunes agrupa también el sábado y el domingo anteriores). */
  date: LocalDate,
  /** Los días que entran en este renglón, si son más de uno. */
  groupedDays: z.array(LocalDate),
  sales: SignedMoney,
  commission: SignedMoney,
  vat: SignedMoney,
  expected: SignedMoney,
  deposit: SignedMoney,
  /** `deposit − expected`. */
  difference: SignedMoney,
  status: CantaloupeStatus,
});
export type CantaloupeDayDto = z.infer<typeof CantaloupeDayDto>;
export const CantaloupeList = z.object({
  /** Tasa de comisión usada, como texto: «0.0340». */
  rate: z.string(),
  items: z.array(CantaloupeDayDto),
});
export type CantaloupeList = z.infer<typeof CantaloupeList>;

// Cuadres
export const CHECK_STATUSES = ['ok', 'warning', 'error'] as const;
export const CheckStatus = z.enum(CHECK_STATUSES);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const CheckDto = z.object({
  /** `sales`, `bank_balance:<accountId>`, `bank_net`, `payroll`, `uncategorized` o `duplicates`. */
  id: z.string(),
  title: z.string(),
  status: CheckStatus,
  valueA: z.string(),
  valueB: z.string(),
  difference: z.string(),
  /** Explicación en lenguaje llano. */
  message: z.string(),
  /** Hasta 50 movimientos involucrados, para ir a verlos. */
  entryIds: z.array(Id),
});
export type CheckDto = z.infer<typeof CheckDto>;
export const CheckList = listOf(CheckDto);
export type CheckList = z.infer<typeof CheckList>;

// Cierre
export const ReopenInput = z.object({
  reason: z.string().trim().min(5, 'Explica el motivo (mínimo 5 caracteres)').max(500),
});
export type ReopenInput = z.infer<typeof ReopenInput>;

/** Lo que bloquea el cierre; viaja en `details` del error `CLOSE_BLOCKED`. */
export const CloseBlockedDetails = z.object({
  errors: z.array(CheckDto),
  pendingReview: z.number().int(),
});
export type CloseBlockedDetails = z.infer<typeof CloseBlockedDetails>;

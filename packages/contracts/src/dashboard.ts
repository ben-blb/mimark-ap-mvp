import { z } from 'zod';
import { Currency, Id, LocalDate, Money } from './common.js';

/** Importes por moneda: MXN y USD nunca se suman entre sí. */
export const MoneyByCurrency = z.object({ MXN: Money, USD: Money });
export type MoneyByCurrency = z.infer<typeof MoneyByCurrency>;

const Bucket = z.object({ count: z.number().int(), amount: MoneyByCurrency });
export type Bucket = z.infer<typeof Bucket>;

export const HORIZONS = [7, 15, 30] as const;
export type Horizon = (typeof HORIZONS)[number];

export const DashboardQuery = z.object({
  horizon: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(15), z.literal(30)]))
    .default(15),
});
export type DashboardQuery = z.infer<typeof DashboardQuery>;

export const DashboardItem = z.object({
  id: Id,
  supplierName: z.string(),
  invoiceNumber: z.string(),
  total: Money,
  currency: Currency,
  dueOn: LocalDate,
  payOn: LocalDate,
  status: z.enum(['confirmed', 'scheduled']),
  urgent: z.boolean(),
  overdue: z.boolean(),
});

export const DashboardDto = z.object({
  today: LocalDate,
  horizon: z.number().int(),
  totals: z.object({
    pending: Bucket,
    overdue: Bucket,
    upcoming: Bucket,
    paidThisMonth: Bucket,
  }),
  /** requires_review + pending_confirmation. */
  inReview: z.number().int(),
  byPayDay: z.array(
    z.object({ payOn: LocalDate, count: z.number().int(), amount: MoneyByCurrency }),
  ),
  items: z.array(DashboardItem),
});
export type DashboardDto = z.infer<typeof DashboardDto>;

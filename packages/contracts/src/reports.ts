import { z } from 'zod';
import { Id, LocalDate, intField } from './common.js';
import { EdoResLine } from './closing.js';
import { Month, SignedMoney } from './closing-uploads.js';

/** Reportes del cierre (spec 024): EDO RES, kioskos y proveedores. Solo lectura; importes como texto con signo. */

/** `empty`: sin movimientos; `provisional`: hay por clasificar o el periodo sigue abierto; `final`: periodo cerrado. */
export const REPORT_STATUSES = ['empty', 'provisional', 'final'] as const;
export const ReportStatus = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** Renglón de lo que aún no tiene categoría. */
export const UNCLASSIFIED_LINE = 'Por clasificar';
export const ReportLine = z.union([EdoResLine, z.literal(UNCLASSIFIED_LINE)], {
  error: 'Renglón inválido',
});
export type ReportLine = z.infer<typeof ReportLine>;

/** Un porcentaje con 2 decimales como texto: "39.25". */
const Percent = z.string().regex(/^-?\d+\.\d{2}$/);

const optionalMonth = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  Month.optional(),
);

export const EdoResQuery = z.object({ companyId: Id, month: Month, compareTo: optionalMonth });
export type EdoResQuery = z.infer<typeof EdoResQuery>;

export const ReportQuery = z.object({ companyId: Id, month: Month });
export type ReportQuery = z.infer<typeof ReportQuery>;

export const EdoResRowDto = z.object({
  /** Estable: el renglón (`Rentas`), `unclassified` o el subtotal (`net_sales`, `cost`, `gross_profit`…). */
  key: z.string(),
  label: z.string(),
  kind: z.enum(['line', 'subtotal', 'total']),
  /** El renglón al que se puede bajar al detalle; `null` en subtotales y total. */
  line: ReportLine.nullable(),
  amount: SignedMoney,
  /** Sobre ventas netas; `null` si las ventas son 0. */
  percentOfSales: Percent.nullable(),
  previousAmount: SignedMoney.optional(),
  delta: SignedMoney.optional(),
});
export type EdoResRowDto = z.infer<typeof EdoResRowDto>;

export const EdoResDto = z.object({
  companyId: Id,
  month: Month,
  status: ReportStatus,
  compareTo: Month.nullable(),
  rows: z.array(EdoResRowDto),
});
export type EdoResDto = z.infer<typeof EdoResDto>;

export const DrillQuery = ReportQuery.extend({
  page: intField({ min: 1, max: 100000, required: 'Página inválida' }).default(1),
  pageSize: intField({ min: 1, max: 500, required: 'Tamaño inválido' }).default(100),
});
export type DrillQuery = z.infer<typeof DrillQuery>;

export const DrillCategoryDto = z.object({
  code: z.string(),
  name: z.string(),
  amount: SignedMoney,
  count: z.number().int(),
});
export type DrillCategoryDto = z.infer<typeof DrillCategoryDto>;

export const DrillEntryDto = z.object({
  id: Id,
  date: LocalDate,
  concept: z.string(),
  kioskId: Id.nullable(),
  kioskName: z.string().nullable(),
  accountId: Id.nullable(),
  accountName: z.string().nullable(),
  categoryCode: z.string().nullable(),
  /** Con el signo del renglón: la suma de la página completa es el importe del renglón. */
  amount: SignedMoney,
  uploadId: Id.nullable(),
  fileName: z.string().nullable(),
  rowNumber: z.number().int().nullable(),
});
export type DrillEntryDto = z.infer<typeof DrillEntryDto>;

export const DrillDto = z.object({
  line: ReportLine,
  amount: SignedMoney,
  /** Subtotal por categoría, antes de las partidas (AC-024-08). */
  categories: z.array(DrillCategoryDto),
  items: z.array(DrillEntryDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DrillDto = z.infer<typeof DrillDto>;

const kioskTotals = {
  sales: SignedMoney,
  cost: SignedMoney,
  margin: SignedMoney,
  waste: SignedMoney,
  theft: SignedMoney,
  commissions: SignedMoney,
  profitBeforeOverhead: SignedMoney,
};

export const KioskRowDto = z.object({
  /** `null` es la fila «Sin kiosko». */
  kioskId: Id.nullable(),
  name: z.string(),
  ...kioskTotals,
  marginPercent: Percent.nullable(),
  negativeMargin: z.boolean(),
});
export type KioskRowDto = z.infer<typeof KioskRowDto>;

export const KioskReportDto = z.object({
  companyId: Id,
  month: Month,
  status: ReportStatus,
  rows: z.array(KioskRowDto),
  /** «Gastos generales (sin asignar)»: no se prorratea (AC-024-11). */
  overhead: SignedMoney,
  /** Lo que aún no tiene categoría. */
  unclassified: SignedMoney,
  totals: z.object(kioskTotals),
});
export type KioskReportDto = z.infer<typeof KioskReportDto>;

export const SupplierRowDto = z.object({
  /** El patrón de la regla que clasificó el pago. */
  name: z.string(),
  total: SignedMoney,
  count: z.number().int(),
  average: SignedMoney,
  percentOfSpend: Percent,
  firstPaymentOn: LocalDate,
  lastPaymentOn: LocalDate,
});
export type SupplierRowDto = z.infer<typeof SupplierRowDto>;

export const SupplierReportDto = z.object({
  companyId: Id,
  month: Month,
  status: ReportStatus,
  totalSpend: SignedMoney,
  rows: z.array(SupplierRowDto),
});
export type SupplierReportDto = z.infer<typeof SupplierReportDto>;

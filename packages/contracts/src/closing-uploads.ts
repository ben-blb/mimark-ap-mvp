import { z } from 'zod';
import { Id, LocalDate, Money, intField, listOf } from './common.js';

/** Cargas de fuentes del mes y movimientos del cierre (spec 021). */

export const SOURCES = [
  'parlevel_sales',
  'parlevel_waste',
  'cantaloupe',
  'bank_csv',
  'bank_pdf',
  'cash',
  'payroll',
] as const;
export const Source = z.enum(SOURCES);
export type Source = z.infer<typeof Source>;

/** Fuentes que se cargan como hoja de cálculo por `POST /closing/uploads`; `bank_pdf` tiene su propia ruta (spec 022). */
export const SHEET_SOURCES = SOURCES.filter(
  (source): source is Exclude<(typeof SOURCES)[number], 'bank_pdf'> => source !== 'bank_pdf',
);
export const SheetSource = z.enum(SHEET_SOURCES);
export type SheetSource = z.infer<typeof SheetSource>;

/** Mes del periodo: 'AAAA-MM'. */
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Usa el formato AAAA-MM');
export type Month = z.infer<typeof Month>;

/** Importe con signo (ingreso +, egreso −) y hasta 2 decimales, como texto: "-1234.50". */
export const SignedMoney = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Importe inválido: usa números con hasta 2 decimales');
export type SignedMoney = z.infer<typeof SignedMoney>;

export const UPLOAD_STATUSES = [
  'previewed',
  'confirmed',
  'superseded',
  'discarded',
  'failed',
] as const;
export const UploadStatus = z.enum(UPLOAD_STATUSES);
export type UploadStatus = z.infer<typeof UploadStatus>;

/** Campos de texto del multipart; el archivo va aparte. */
export const UploadInput = z.object({
  companyId: Id,
  month: Month,
  source: SheetSource,
  /** Obligatoria solo para `bank_csv`; un campo vacío es «sin cuenta». */
  accountId: z.preprocess((v) => (v === '' ? undefined : v), Id.optional()),
});
export type UploadInput = z.infer<typeof UploadInput>;

const timestamps = { createdAt: z.iso.datetime() };

export const UploadDto = z.object({
  id: Id,
  companyId: Id,
  month: Month,
  source: Source,
  accountId: Id.nullable(),
  fileName: z.string(),
  status: UploadStatus,
  uploadedBy: z.string(),
  rowsRead: z.number().int(),
  rowsRejected: z.number().int(),
  entriesCount: z.number().int(),
  ...timestamps,
});
export type UploadDto = z.infer<typeof UploadDto>;
export const UploadList = listOf(UploadDto);
export type UploadList = z.infer<typeof UploadList>;

export const UploadListQuery = z.object({ companyId: Id, month: Month });
export type UploadListQuery = z.infer<typeof UploadListQuery>;

/** Fila del archivo que no se pudo leer; `row` es el número de fila de la hoja (la cabecera es la 1). */
export const RejectedRowDto = z.object({ row: z.number().int(), reason: z.string() });
export type RejectedRowDto = z.infer<typeof RejectedRowDto>;

export const PreviewEntryDto = z.object({
  row: z.number().int(),
  date: LocalDate,
  kioskId: Id.nullable(),
  concept: z.string(),
  amount: SignedMoney,
  /** Avisos de la fila, p. ej. `UNKNOWN_KIOSK:A-100`. */
  flags: z.array(z.string()),
});
export type PreviewEntryDto = z.infer<typeof PreviewEntryDto>;

export const UploadPreviewDto = z.object({
  upload: UploadDto,
  rowsRead: z.number().int(),
  rowsRejected: z.number().int(),
  /** Filas con kiosko desconocido: quedan «sin kiosko», no se descartan. */
  rowsUnknownKiosk: z.number().int(),
  /** Suma con signo de todas las filas válidas, para compararla con el Excel de la contadora. */
  total: SignedMoney,
  rejected: z.array(RejectedRowDto),
  sample: z.array(PreviewEntryDto),
});
export type UploadPreviewDto = z.infer<typeof UploadPreviewDto>;

export const LedgerEntryDto = z.object({
  id: Id,
  companyId: Id,
  month: Month,
  date: LocalDate,
  kioskId: Id.nullable(),
  accountId: Id.nullable(),
  source: Source,
  uploadId: Id.nullable(),
  rowNumber: z.number().int().nullable(),
  concept: z.string(),
  amount: SignedMoney,
  /** Spec 023: categoría puesta por regla o a mano, y si es parte de un traspaso confirmado. */
  categoryId: Id.nullable(),
  kind: z.enum(['normal', 'internal_transfer']),
  needsReview: z.boolean(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export type LedgerEntryDto = z.infer<typeof LedgerEntryDto>;

/** Captura manual: solo caja y nómina (AC-021-12). */
export const CreateEntryInput = z.object({
  companyId: Id,
  source: z.enum(['cash', 'payroll']),
  date: LocalDate,
  concept: z.string().trim().min(1, 'Escribe el concepto').max(300, 'Máximo 300 caracteres'),
  amount: SignedMoney,
  kioskId: Id.optional(),
});
export type CreateEntryInput = z.infer<typeof CreateEntryInput>;

export const EntryListQuery = z.object({
  companyId: Id,
  month: Month,
  source: Source.optional(),
  kioskId: Id.optional(),
  page: intField({ min: 1, max: 100000, required: 'Página inválida' }).default(1),
  pageSize: intField({ min: 1, max: 500, required: 'Tamaño inválido' }).default(100),
});
export type EntryListQuery = z.infer<typeof EntryListQuery>;

export const EntryList = z.object({
  items: z.array(LedgerEntryDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type EntryList = z.infer<typeof EntryList>;

/** Estado de cuenta en PDF (spec 022). */

/** Lo que la IA devuelve: solo datos del documento. Importes en texto, fechas AAAA-MM-DD. */
export const BankExtractionRow = z.object({
  date: LocalDate,
  concept: z.string(),
  withdrawal: Money.nullable(),
  deposit: Money.nullable(),
  /** Saldo corrido de la fila, si el banco lo imprime. */
  balance: SignedMoney.nullable(),
});
export type BankExtractionRow = z.infer<typeof BankExtractionRow>;

export const BankExtraction = z.object({
  openingBalance: SignedMoney,
  closingBalance: SignedMoney,
  rows: z.array(BankExtractionRow).max(2000),
});
export type BankExtraction = z.infer<typeof BankExtraction>;

/** Fila editable del borrador; `row` es su número (1 = primera fila del estado de cuenta) y no cambia al editar. */
export const BankDraftRow = BankExtractionRow.extend({
  row: z.number().int().min(1),
  discarded: z.boolean(),
});
export type BankDraftRow = z.infer<typeof BankDraftRow>;

/** Lo que se guarda en `SourceUpload.draft` hasta confirmar. */
export const BankDraftData = z.object({
  openingBalance: SignedMoney,
  closingBalance: SignedMoney,
  rows: z.array(BankDraftRow),
});
export type BankDraftData = z.infer<typeof BankDraftData>;

export const BANK_ROW_FLAGS = ['UNCERTAIN', 'OUT_OF_MONTH'] as const;
export const BankRowFlag = z.enum(BANK_ROW_FLAGS);
export type BankRowFlag = z.infer<typeof BankRowFlag>;

export const BankStatementRow = BankDraftRow.extend({ flags: z.array(BankRowFlag) });
export type BankStatementRow = z.infer<typeof BankStatementRow>;

/** `difference` = cierre − (apertura + depósitos − retiros), con signo. */
export const BalanceCheck = z.object({ ok: z.boolean(), difference: SignedMoney });
export type BalanceCheck = z.infer<typeof BalanceCheck>;

export const BankStatementDraft = z.object({
  upload: UploadDto,
  openingBalance: SignedMoney,
  closingBalance: SignedMoney,
  rows: z.array(BankStatementRow),
  balanceCheck: BalanceCheck,
  /** Avisos que no bloquean, p. ej. `OPENING_BALANCE_MISMATCH`. */
  warnings: z.array(z.enum(['OPENING_BALANCE_MISMATCH'])),
});
export type BankStatementDraft = z.infer<typeof BankStatementDraft>;

export const BankRowEdit = z.object({
  row: z.number().int().min(1),
  date: LocalDate.optional(),
  concept: z
    .string()
    .trim()
    .min(1, 'Escribe el concepto')
    .max(300, 'Máximo 300 caracteres')
    .optional(),
  withdrawal: Money.nullable().optional(),
  deposit: Money.nullable().optional(),
  discarded: z.boolean().optional(),
});
export type BankRowEdit = z.infer<typeof BankRowEdit>;

export const UpdateBankDraftInput = z.object({ rows: z.array(BankRowEdit).min(1).max(2000) });
export type UpdateBankDraftInput = z.infer<typeof UpdateBankDraftInput>;

/** Cuerpo opcional de `confirm` (sin cuerpo = `{}`); `acceptDifference` solo lo usa `bank_pdf` (AC-022-03). */
export const ConfirmUploadInput = z
  .object({ acceptDifference: z.boolean().optional() })
  .default({});
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadInput>;

/** Campos de texto de `POST /closing/uploads/bank-pdf`; la cuenta se valida en el service (AC-021-07). */
export const BankPdfInput = UploadInput.omit({ source: true });
export type BankPdfInput = z.infer<typeof BankPdfInput>;

import { z } from 'zod';
import { Id, LocalDate, intField, listOf } from './common.js';

/** Cargas de fuentes del mes y movimientos del cierre (spec 021). */

export const SOURCES = [
  'parlevel_sales',
  'parlevel_waste',
  'cantaloupe',
  'bank_csv',
  'cash',
  'payroll',
] as const;
export const Source = z.enum(SOURCES);
export type Source = z.infer<typeof Source>;

/** Mes del periodo: 'AAAA-MM'. */
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Usa el formato AAAA-MM');
export type Month = z.infer<typeof Month>;

/** Importe con signo (ingreso +, egreso −) y hasta 2 decimales, como texto: "-1234.50". */
export const SignedMoney = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Importe inválido: usa números con hasta 2 decimales');
export type SignedMoney = z.infer<typeof SignedMoney>;

export const UPLOAD_STATUSES = ['previewed', 'confirmed', 'superseded', 'discarded'] as const;
export const UploadStatus = z.enum(UPLOAD_STATUSES);
export type UploadStatus = z.infer<typeof UploadStatus>;

/** Campos de texto del multipart; el archivo va aparte. */
export const UploadInput = z.object({
  companyId: Id,
  month: Month,
  source: Source,
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

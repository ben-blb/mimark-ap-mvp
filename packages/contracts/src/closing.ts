import { z } from 'zod';
import { Id, intField, listOf } from './common.js';

/** Catálogo del cierre mensual (spec 020): empresas, kioskos, cuentas, categorías y reglas. */

/** Renglones del Estado de resultados permitidos para una categoría (se ajustan con la contadora). */
export const EDO_RES_LINES = [
  'Ventas',
  'Venta directa',
  'Otros ingresos',
  'Robos',
  'Mermas',
  'Costo de lo vendido',
  'Rentas',
  'Nóminas',
  'Gasolina',
  'Fee Cantaloupe',
  'Fee Nayax',
  'Telemetría',
  'Fee software',
  'Teléfono, internet, luz y agua',
  'Seguridad y vigilancia',
  'Papelería y MKT',
  'Fumigación',
  'Tarjetas de crédito',
  'Créditos',
  'Comisión bancaria',
  'Intereses',
  'Impuestos',
  'Inversiones',
  'No deducibles',
] as const;
export const EdoResLine = z.enum(EDO_RES_LINES, {
  error: 'Elige un renglón del Estado de resultados',
});
export type EdoResLine = z.infer<typeof EdoResLine>;

export const CATEGORY_KINDS = ['income', 'cost', 'expense'] as const;
export const CategoryKind = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof CategoryKind>;

export const ACCOUNT_TYPES = ['checking', 'credit', 'master'] as const;
export const AccountType = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof AccountType>;

const name = (label: string) =>
  z.string().trim().min(2, `Escribe ${label}`).max(200, 'Máximo 200 caracteres');
const optionalId = (max = 100) =>
  z.string().trim().min(1).max(max, `Máximo ${max} caracteres`).optional();

const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };

/** Consulta común de listados: las desactivadas solo salen con `includeInactive=true`. */
export const ClosingListQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type ClosingListQuery = z.infer<typeof ClosingListQuery>;

// Empresas
export const CompanyDto = z.object({
  id: Id,
  name: z.string(),
  active: z.boolean(),
  ...timestamps,
});
export type CompanyDto = z.infer<typeof CompanyDto>;
export const CompanyList = listOf(CompanyDto);
export const CreateCompanyInput = z.object({ name: name('el nombre de la empresa') });
export type CreateCompanyInput = z.infer<typeof CreateCompanyInput>;
export const UpdateCompanyInput = CreateCompanyInput.extend({ active: z.boolean() }).partial();
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

// Kioskos
export const KioskDto = z.object({
  id: Id,
  companyId: Id,
  name: z.string(),
  parlevelAsset: z.string().nullable(),
  cantaloupeDeviceId: z.string().nullable(),
  active: z.boolean(),
  ...timestamps,
});
export type KioskDto = z.infer<typeof KioskDto>;
export const KioskList = listOf(KioskDto);
export const CreateKioskInput = z.object({
  companyId: Id,
  name: name('el nombre del kiosko'),
  /** Columna «Asset» del export de Parlevel. */
  parlevelAsset: optionalId(),
  /** Columna «Device ID» del export de Cantaloupe. */
  cantaloupeDeviceId: optionalId(),
});
export type CreateKioskInput = z.infer<typeof CreateKioskInput>;
export const UpdateKioskInput = CreateKioskInput.extend({ active: z.boolean() }).partial();
export type UpdateKioskInput = z.infer<typeof UpdateKioskInput>;

// Cuentas bancarias (nunca el número completo)
export const BankAccountDto = z.object({
  id: Id,
  companyId: Id,
  name: z.string(),
  type: AccountType,
  last4: z.string().nullable(),
  active: z.boolean(),
  ...timestamps,
});
export type BankAccountDto = z.infer<typeof BankAccountDto>;
export const BankAccountList = listOf(BankAccountDto);
export const CreateAccountInput = z.object({
  companyId: Id,
  name: name('el nombre de la cuenta'),
  type: AccountType,
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Escribe solo los últimos 4 dígitos')
    .optional(),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;
export const UpdateAccountInput = CreateAccountInput.extend({ active: z.boolean() }).partial();
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;

// Categorías
export const CategoryDto = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  edoResLine: EdoResLine,
  kind: CategoryKind,
  sortOrder: z.number().int(),
  active: z.boolean(),
  ...timestamps,
});
export type CategoryDto = z.infer<typeof CategoryDto>;
export const CategoryList = listOf(CategoryDto);
export const CreateCategoryInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Usa mayúsculas, números y guiones bajos, p. ej. SEGURIDAD')
    .max(50, 'Máximo 50 caracteres'),
  name: name('el nombre de la categoría'),
  edoResLine: EdoResLine,
  kind: CategoryKind,
  sortOrder: intField({ min: 0, max: 9999, required: 'Escribe el orden' }).optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;
export const UpdateCategoryInput = CreateCategoryInput.omit({ code: true })
  .extend({ active: z.boolean() })
  .partial();
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

// Reglas de clasificación
export const RuleDto = z.object({
  id: Id,
  pattern: z.string(),
  categoryId: Id,
  priority: z.number().int(),
  active: z.boolean(),
  ...timestamps,
});
export type RuleDto = z.infer<typeof RuleDto>;
export const RuleList = listOf(RuleDto);
export const CreateRuleInput = z.object({
  pattern: z
    .string()
    .trim()
    .min(3, 'Escribe al menos 3 caracteres')
    .max(200, 'Máximo 200 caracteres'),
  categoryId: Id,
  priority: intField({ min: 0, max: 1000, required: 'Escribe la prioridad' }).default(0),
});
export type CreateRuleInput = z.infer<typeof CreateRuleInput>;
export const UpdateRuleInput = CreateRuleInput.extend({ active: z.boolean() }).partial();
export type UpdateRuleInput = z.infer<typeof UpdateRuleInput>;

export const TestRuleInput = z.object({
  concept: z.string().trim().min(1, 'Escribe un concepto').max(500, 'Máximo 500 caracteres'),
});
export type TestRuleInput = z.infer<typeof TestRuleInput>;
export const TestRuleResult = z.object({
  rule: RuleDto.nullable(),
  category: CategoryDto.nullable(),
});
export type TestRuleResult = z.infer<typeof TestRuleResult>;

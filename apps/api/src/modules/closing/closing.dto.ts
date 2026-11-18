import type {
  BankAccountDto,
  CategoryDto,
  CompanyDto,
  KioskDto,
  RuleDto,
} from '@mimark/contracts/closing';
import type {
  BankAccount,
  Category,
  ClassificationRule,
  Company,
  Kiosk,
} from '../../generated/prisma/client.js';

/** Filas de Prisma → DTOs de contracts (spec 020). */
const iso = (r: { createdAt: Date; updatedAt: Date }) => ({
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const toCompany = (c: Company): CompanyDto => ({
  id: c.id,
  name: c.name,
  active: c.active,
  ...iso(c),
});

export const toKiosk = (k: Kiosk): KioskDto => ({
  id: k.id,
  companyId: k.companyId,
  name: k.name,
  parlevelAsset: k.parlevelAsset,
  cantaloupeDeviceId: k.cantaloupeDeviceId,
  active: k.active,
  ...iso(k),
});

export const toAccount = (a: BankAccount): BankAccountDto => ({
  id: a.id,
  companyId: a.companyId,
  name: a.name,
  type: a.type,
  last4: a.last4,
  active: a.active,
  ...iso(a),
});

export const toCategory = (c: Category): CategoryDto => ({
  id: c.id,
  code: c.code,
  name: c.name,
  edoResLine: c.edoResLine as CategoryDto['edoResLine'],
  kind: c.kind,
  sortOrder: c.sortOrder,
  active: c.active,
  ...iso(c),
});

export const toRule = (r: ClassificationRule): RuleDto => ({
  id: r.id,
  pattern: r.pattern,
  categoryId: r.categoryId,
  priority: r.priority,
  active: r.active,
  ...iso(r),
});

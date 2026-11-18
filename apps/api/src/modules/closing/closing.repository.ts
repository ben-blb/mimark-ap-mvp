import { Injectable } from '@nestjs/common';
import type {
  CreateAccountInput,
  CreateCategoryInput,
  CreateKioskInput,
  CreateRuleInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateCompanyInput,
  UpdateKioskInput,
  UpdateRuleInput,
} from '@mimark/contracts/closing';
import { AppError } from '../../common/app-error.js';
import { Db, isNotFound, isUniqueViolation, type Tx } from '../../common/db.js';
import type {
  BankAccount,
  Category,
  ClassificationRule,
  Company,
  Kiosk,
} from '../../generated/prisma/client.js';

const CONFLICT = new AppError('CONFLICT', 'Ya existe un registro con esos datos.');

/** Convierte los fallos de unicidad y de «no existe» de Prisma en errores del catálogo. */
async function guard<T>(run: () => Promise<T>, notFound: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw CONFLICT;
    if (isNotFound(error)) throw new AppError('NOT_FOUND', notFound);
    throw error;
  }
}

const activeOnly = (includeInactive: boolean) => (includeInactive ? {} : { active: true });

/** Única puerta a las tablas del catálogo del cierre (spec 020). Solo el módulo closing escribe en ellas. */
@Injectable()
export class ClosingRepository {
  constructor(private readonly db: Db) {}

  // Empresas
  listCompanies(includeInactive: boolean): Promise<Company[]> {
    return this.db.company.findMany({
      where: activeOnly(includeInactive),
      orderBy: { name: 'asc' },
    });
  }
  findCompany(id: string, tx: Tx = this.db): Promise<Company | null> {
    return tx.company.findUnique({ where: { id } });
  }
  findCompanyByNameKey(nameKey: string, tx: Tx = this.db): Promise<Company | null> {
    return tx.company.findUnique({ where: { nameKey } });
  }
  createCompany(data: { name: string; nameKey: string }, tx: Tx = this.db): Promise<Company> {
    return guard(() => tx.company.create({ data }), 'No existe esa empresa.');
  }
  updateCompany(
    id: string,
    data: UpdateCompanyInput & { nameKey?: string },
    tx: Tx = this.db,
  ): Promise<Company> {
    return guard(() => tx.company.update({ where: { id }, data }), 'No existe esa empresa.');
  }

  // Kioskos
  listKiosks(includeInactive: boolean): Promise<Kiosk[]> {
    return this.db.kiosk.findMany({ where: activeOnly(includeInactive), orderBy: { name: 'asc' } });
  }
  findKiosk(id: string, tx: Tx = this.db): Promise<Kiosk | null> {
    return tx.kiosk.findUnique({ where: { id } });
  }
  findKioskByParlevelAsset(parlevelAsset: string, tx: Tx = this.db): Promise<Kiosk | null> {
    return tx.kiosk.findUnique({ where: { parlevelAsset } });
  }
  findKioskByCantaloupeDevice(cantaloupeDeviceId: string, tx: Tx = this.db): Promise<Kiosk | null> {
    return tx.kiosk.findUnique({ where: { cantaloupeDeviceId } });
  }
  createKiosk(data: CreateKioskInput, tx: Tx = this.db): Promise<Kiosk> {
    return guard(() => tx.kiosk.create({ data }), 'No existe ese kiosko.');
  }
  updateKiosk(id: string, data: UpdateKioskInput, tx: Tx = this.db): Promise<Kiosk> {
    return guard(() => tx.kiosk.update({ where: { id }, data }), 'No existe ese kiosko.');
  }

  // Cuentas
  listAccounts(includeInactive: boolean): Promise<BankAccount[]> {
    return this.db.bankAccount.findMany({
      where: activeOnly(includeInactive),
      orderBy: { name: 'asc' },
    });
  }
  findAccount(id: string, tx: Tx = this.db): Promise<BankAccount | null> {
    return tx.bankAccount.findUnique({ where: { id } });
  }
  createAccount(data: CreateAccountInput, tx: Tx = this.db): Promise<BankAccount> {
    return guard(() => tx.bankAccount.create({ data }), 'No existe esa cuenta.');
  }
  updateAccount(id: string, data: UpdateAccountInput, tx: Tx = this.db): Promise<BankAccount> {
    return guard(() => tx.bankAccount.update({ where: { id }, data }), 'No existe esa cuenta.');
  }

  // Categorías (el orden del EDO RES lo da `sortCategories`)
  listCategories(): Promise<Category[]> {
    return this.db.category.findMany();
  }
  findCategory(id: string, tx: Tx = this.db): Promise<Category | null> {
    return tx.category.findUnique({ where: { id } });
  }
  findCategoryByCode(code: string, tx: Tx = this.db): Promise<Category | null> {
    return tx.category.findUnique({ where: { code } });
  }
  createCategory(data: CreateCategoryInput, tx: Tx = this.db): Promise<Category> {
    return guard(() => tx.category.create({ data }), 'No existe esa categoría.');
  }
  updateCategory(id: string, data: UpdateCategoryInput, tx: Tx = this.db): Promise<Category> {
    return guard(() => tx.category.update({ where: { id }, data }), 'No existe esa categoría.');
  }

  // Reglas
  listRules(includeInactive: boolean): Promise<ClassificationRule[]> {
    return this.db.classificationRule.findMany({
      where: activeOnly(includeInactive),
      orderBy: [{ priority: 'desc' }, { pattern: 'asc' }],
    });
  }
  findRule(id: string, tx: Tx = this.db): Promise<ClassificationRule | null> {
    return tx.classificationRule.findUnique({ where: { id } });
  }
  createRule(
    data: CreateRuleInput & { patternKey: string },
    tx: Tx = this.db,
  ): Promise<ClassificationRule> {
    return guard(() => tx.classificationRule.create({ data }), 'No existe esa regla.');
  }
  updateRule(
    id: string,
    data: UpdateRuleInput & { patternKey?: string },
    tx: Tx = this.db,
  ): Promise<ClassificationRule> {
    return guard(
      () => tx.classificationRule.update({ where: { id }, data }),
      'No existe esa regla.',
    );
  }
}

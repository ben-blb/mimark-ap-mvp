import { Injectable } from '@nestjs/common';
import type {
  BankAccountDto,
  BankAccountList,
  CategoryDto,
  CategoryList,
  CompanyDto,
  CompanyList,
  CreateAccountInput,
  CreateCategoryInput,
  CreateCompanyInput,
  CreateKioskInput,
  CreateRuleInput,
  KioskDto,
  KioskList,
  RuleDto,
  RuleList,
  TestRuleResult,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateCompanyInput,
  UpdateKioskInput,
  UpdateRuleInput,
} from '@mimark/contracts/closing';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db, type Tx } from '../../common/db.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { ClosingRepository } from './closing.repository.js';
import { toAccount, toCategory, toCompany, toKiosk, toRule } from './closing.dto.js';
import { matchRule, normalizeKey, sortCategories } from './closing.rules.js';

type Entity = 'company' | 'kiosk' | 'account' | 'category' | 'rule';

/**
 * Catálogo del cierre mensual (spec 020). Cada escritura va con su evento de auditoría en la misma
 * transacción: `crear` guarda lo que se creó y `editar` guarda solo los campos que cambiaron.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly db: Db,
    private readonly closing: ClosingRepository,
    private readonly audit: AuditRepository,
  ) {}

  // Empresas
  async listCompanies(includeInactive: boolean): Promise<CompanyList> {
    return { items: (await this.closing.listCompanies(includeInactive)).map(toCompany) };
  }

  createCompany(input: CreateCompanyInput, ctx: Ctx): Promise<CompanyDto> {
    return this.db.$transaction(async (tx) => {
      const nameKey = normalizeKey(input.name);
      await this.requireCompanyNameFree(nameKey, null, tx);
      const company = await this.closing.createCompany({ name: input.name, nameKey }, tx);
      await this.log('company', company.id, 'created', { after: input }, ctx, tx);
      return toCompany(company);
    });
  }

  updateCompany(id: string, input: UpdateCompanyInput, ctx: Ctx): Promise<CompanyDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.closing.findCompany(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe esa empresa.');
      const nameKey = input.name === undefined ? undefined : normalizeKey(input.name);
      if (nameKey) await this.requireCompanyNameFree(nameKey, id, tx);
      const after = await this.closing.updateCompany(id, { ...input, nameKey }, tx);
      await this.logChanges('company', before, after, ['name', 'active'], ctx, tx);
      return toCompany(after);
    });
  }

  // Kioskos
  async listKiosks(includeInactive: boolean): Promise<KioskList> {
    return { items: (await this.closing.listKiosks(includeInactive)).map(toKiosk) };
  }

  createKiosk(input: CreateKioskInput, ctx: Ctx): Promise<KioskDto> {
    return this.db.$transaction(async (tx) => {
      await this.requireCompany(input.companyId, tx);
      await this.requireKioskIdsFree(input, null, tx);
      const kiosk = await this.closing.createKiosk(input, tx);
      await this.log('kiosk', kiosk.id, 'created', { after: input }, ctx, tx);
      return toKiosk(kiosk);
    });
  }

  updateKiosk(id: string, input: UpdateKioskInput, ctx: Ctx): Promise<KioskDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.closing.findKiosk(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe ese kiosko.');
      if (input.companyId) await this.requireCompany(input.companyId, tx);
      await this.requireKioskIdsFree(input, id, tx);
      const after = await this.closing.updateKiosk(id, input, tx);
      await this.logChanges(
        'kiosk',
        before,
        after,
        ['companyId', 'name', 'parlevelAsset', 'cantaloupeDeviceId', 'active'],
        ctx,
        tx,
      );
      return toKiosk(after);
    });
  }

  // Cuentas
  async listAccounts(includeInactive: boolean): Promise<BankAccountList> {
    return { items: (await this.closing.listAccounts(includeInactive)).map(toAccount) };
  }

  createAccount(input: CreateAccountInput, ctx: Ctx): Promise<BankAccountDto> {
    return this.db.$transaction(async (tx) => {
      await this.requireCompany(input.companyId, tx);
      const account = await this.closing.createAccount(input, tx);
      await this.log('account', account.id, 'created', { after: input }, ctx, tx);
      return toAccount(account);
    });
  }

  updateAccount(id: string, input: UpdateAccountInput, ctx: Ctx): Promise<BankAccountDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.closing.findAccount(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe esa cuenta.');
      if (input.companyId) await this.requireCompany(input.companyId, tx);
      const after = await this.closing.updateAccount(id, input, tx);
      await this.logChanges(
        'account',
        before,
        after,
        ['companyId', 'name', 'type', 'last4', 'active'],
        ctx,
        tx,
      );
      return toAccount(after);
    });
  }

  // Categorías
  async listCategories(): Promise<CategoryList> {
    const rows = (await this.closing.listCategories()).map(toCategory);
    return { items: sortCategories(rows) };
  }

  createCategory(input: CreateCategoryInput, ctx: Ctx): Promise<CategoryDto> {
    return this.db.$transaction(async (tx) => {
      if (await this.closing.findCategoryByCode(input.code, tx)) {
        throw new AppError('CONFLICT', 'Ya existe una categoría con ese código.', {
          fieldErrors: { code: 'Ya existe una categoría con ese código' },
        });
      }
      const category = await this.closing.createCategory(input, tx);
      await this.log('category', category.id, 'created', { after: input }, ctx, tx);
      return toCategory(category);
    });
  }

  updateCategory(id: string, input: UpdateCategoryInput, ctx: Ctx): Promise<CategoryDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.closing.findCategory(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe esa categoría.');
      const after = await this.closing.updateCategory(id, input, tx);
      await this.logChanges(
        'category',
        before,
        after,
        ['name', 'edoResLine', 'kind', 'sortOrder', 'active'],
        ctx,
        tx,
      );
      return toCategory(after);
    });
  }

  // Reglas
  async listRules(includeInactive: boolean): Promise<RuleList> {
    return { items: (await this.closing.listRules(includeInactive)).map(toRule) };
  }

  createRule(input: CreateRuleInput, ctx: Ctx): Promise<RuleDto> {
    return this.db.$transaction(async (tx) => {
      await this.requireCategory(input.categoryId, tx);
      const rule = await this.closing.createRule(
        { ...input, patternKey: normalizeKey(input.pattern) },
        tx,
      );
      await this.log('rule', rule.id, 'created', { after: input }, ctx, tx);
      return toRule(rule);
    });
  }

  updateRule(id: string, input: UpdateRuleInput, ctx: Ctx): Promise<RuleDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.closing.findRule(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe esa regla.');
      if (input.categoryId) await this.requireCategory(input.categoryId, tx);
      const patternKey = input.pattern === undefined ? undefined : normalizeKey(input.pattern);
      const after = await this.closing.updateRule(id, { ...input, patternKey }, tx);
      await this.logChanges(
        'rule',
        before,
        after,
        ['pattern', 'categoryId', 'priority', 'active'],
        ctx,
        tx,
      );
      return toRule(after);
    });
  }

  /** Prueba un concepto contra las reglas activas sin escribir nada. */
  async testRule(concept: string): Promise<TestRuleResult> {
    const rule = matchRule(concept, await this.closing.listRules(false));
    const category = rule ? await this.closing.findCategory(rule.categoryId) : null;
    return { rule: rule ? toRule(rule) : null, category: category ? toCategory(category) : null };
  }

  // Validaciones compartidas
  private async requireCompany(id: string, tx: Tx): Promise<void> {
    if (!(await this.closing.findCompany(id, tx))) {
      throw new AppError('NOT_FOUND', 'No existe esa empresa.');
    }
  }

  private async requireCategory(id: string, tx: Tx): Promise<void> {
    if (!(await this.closing.findCategory(id, tx))) {
      throw new AppError('NOT_FOUND', 'No existe esa categoría.');
    }
  }

  private async requireCompanyNameFree(nameKey: string, ownId: string | null, tx: Tx) {
    const owner = await this.closing.findCompanyByNameKey(nameKey, tx);
    if (owner && owner.id !== ownId) {
      throw new AppError('CONFLICT', 'Ya existe una empresa con ese nombre.', {
        fieldErrors: { name: 'Ya existe una empresa con ese nombre' },
      });
    }
  }

  private async requireKioskIdsFree(
    ids: { parlevelAsset?: string; cantaloupeDeviceId?: string },
    ownId: string | null,
    tx: Tx,
  ): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    if (ids.parlevelAsset) {
      const owner = await this.closing.findKioskByParlevelAsset(ids.parlevelAsset, tx);
      if (owner && owner.id !== ownId) {
        fieldErrors.parlevelAsset = 'Ya hay un kiosko con ese Asset de Parlevel';
      }
    }
    if (ids.cantaloupeDeviceId) {
      const owner = await this.closing.findKioskByCantaloupeDevice(ids.cantaloupeDeviceId, tx);
      if (owner && owner.id !== ownId) {
        fieldErrors.cantaloupeDeviceId = 'Ya hay un kiosko con ese Device ID de Cantaloupe';
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new AppError('CONFLICT', 'Ese identificador ya pertenece a otro kiosko.', {
        fieldErrors,
      });
    }
  }

  // Auditoría
  private log(
    entity: Entity,
    entityId: string,
    verb: 'created' | 'updated' | 'deactivated',
    data: Record<string, unknown>,
    ctx: Ctx,
    tx: Tx,
  ) {
    return this.audit.log(
      { ...ctx, entity, entityId, action: `${entity}.${verb}`, data: data as never },
      tx,
    );
  }

  private async logChanges<T extends object>(
    entity: Entity,
    before: T,
    after: T,
    fields: readonly (keyof T & string)[],
    ctx: Ctx,
    tx: Tx,
  ): Promise<void> {
    const changes = diffFields(before, after, fields);
    if (Object.keys(changes).length > 0) {
      // Desactivar tiene su propio evento (spec 020, «Auditoría»); reactivar y editar son `updated`.
      const verb = changes.active?.to === false ? 'deactivated' : 'updated';
      await this.log(entity, (after as { id: string }).id, verb, { changes }, ctx, tx);
    }
  }
}

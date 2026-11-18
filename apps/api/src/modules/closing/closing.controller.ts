import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  ClosingListQuery,
  CreateAccountInput,
  CreateCategoryInput,
  CreateCompanyInput,
  CreateKioskInput,
  CreateRuleInput,
  TestRuleInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateCompanyInput,
  UpdateKioskInput,
  UpdateRuleInput,
  type BankAccountDto,
  type BankAccountList,
  type CategoryDto,
  type CategoryList,
  type CompanyDto,
  type CompanyList,
  type KioskDto,
  type KioskList,
  type RuleDto,
  type RuleList,
  type TestRuleResult,
} from '@mimark/contracts/closing';
import { Ctx } from '../../common/ctx.js';
import { Requires } from '../session/session.guard.js';
import { ClosingService } from './closing.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('closing')
export class ClosingController {
  constructor(private readonly closing: ClosingService) {}

  // Empresas
  @Requires('reports:read')
  @Get('companies')
  listCompanies(@Query({ schema: ClosingListQuery }) q: ClosingListQuery): Promise<CompanyList> {
    return this.closing.listCompanies(q.includeInactive);
  }

  @Requires('reports:write')
  @Post('companies')
  createCompany(
    @Body({ schema: CreateCompanyInput }) input: CreateCompanyInput,
    @Ctx() ctx: Ctx,
  ): Promise<CompanyDto> {
    return this.closing.createCompany(input, ctx);
  }

  @Requires('reports:write')
  @Patch('companies/:id')
  updateCompany(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateCompanyInput }) input: UpdateCompanyInput,
    @Ctx() ctx: Ctx,
  ): Promise<CompanyDto> {
    return this.closing.updateCompany(id, input, ctx);
  }

  // Kioskos
  @Requires('reports:read')
  @Get('kiosks')
  listKiosks(@Query({ schema: ClosingListQuery }) q: ClosingListQuery): Promise<KioskList> {
    return this.closing.listKiosks(q.includeInactive);
  }

  @Requires('reports:write')
  @Post('kiosks')
  createKiosk(
    @Body({ schema: CreateKioskInput }) input: CreateKioskInput,
    @Ctx() ctx: Ctx,
  ): Promise<KioskDto> {
    return this.closing.createKiosk(input, ctx);
  }

  @Requires('reports:write')
  @Patch('kiosks/:id')
  updateKiosk(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateKioskInput }) input: UpdateKioskInput,
    @Ctx() ctx: Ctx,
  ): Promise<KioskDto> {
    return this.closing.updateKiosk(id, input, ctx);
  }

  // Cuentas
  @Requires('reports:read')
  @Get('accounts')
  listAccounts(@Query({ schema: ClosingListQuery }) q: ClosingListQuery): Promise<BankAccountList> {
    return this.closing.listAccounts(q.includeInactive);
  }

  @Requires('reports:write')
  @Post('accounts')
  createAccount(
    @Body({ schema: CreateAccountInput }) input: CreateAccountInput,
    @Ctx() ctx: Ctx,
  ): Promise<BankAccountDto> {
    return this.closing.createAccount(input, ctx);
  }

  @Requires('reports:write')
  @Patch('accounts/:id')
  updateAccount(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateAccountInput }) input: UpdateAccountInput,
    @Ctx() ctx: Ctx,
  ): Promise<BankAccountDto> {
    return this.closing.updateAccount(id, input, ctx);
  }

  // Categorías
  @Requires('reports:read')
  @Get('categories')
  listCategories(): Promise<CategoryList> {
    return this.closing.listCategories();
  }

  @Requires('reports:write')
  @Post('categories')
  createCategory(
    @Body({ schema: CreateCategoryInput }) input: CreateCategoryInput,
    @Ctx() ctx: Ctx,
  ): Promise<CategoryDto> {
    return this.closing.createCategory(input, ctx);
  }

  @Requires('reports:write')
  @Patch('categories/:id')
  updateCategory(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateCategoryInput }) input: UpdateCategoryInput,
    @Ctx() ctx: Ctx,
  ): Promise<CategoryDto> {
    return this.closing.updateCategory(id, input, ctx);
  }

  // Reglas (`rules/test` va antes de `rules/:id` para que no se confunda con un id)
  @Requires('reports:read')
  @Get('rules')
  listRules(@Query({ schema: ClosingListQuery }) q: ClosingListQuery): Promise<RuleList> {
    return this.closing.listRules(q.includeInactive);
  }

  @Requires('reports:read')
  @HttpCode(200)
  @Post('rules/test')
  testRule(@Body({ schema: TestRuleInput }) input: TestRuleInput): Promise<TestRuleResult> {
    return this.closing.testRule(input.concept);
  }

  @Requires('reports:write')
  @Post('rules')
  createRule(
    @Body({ schema: CreateRuleInput }) input: CreateRuleInput,
    @Ctx() ctx: Ctx,
  ): Promise<RuleDto> {
    return this.closing.createRule(input, ctx);
  }

  @Requires('reports:write')
  @Patch('rules/:id')
  updateRule(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateRuleInput }) input: UpdateRuleInput,
    @Ctx() ctx: Ctx,
  ): Promise<RuleDto> {
    return this.closing.updateRule(id, input, ctx);
  }
}

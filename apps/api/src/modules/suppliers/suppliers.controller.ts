import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Id } from '@mimark/contracts/common';
import {
  CreateSupplierInput,
  type SupplierDto,
  type SupplierList,
  SupplierListQuery,
  UpdateSupplierInput,
} from '@mimark/contracts/suppliers';
import { Ctx } from '../../common/ctx.js';
import { SuppliersService } from './suppliers.service.js';

/** Solo traduce HTTP: valida con el esquema de contracts y llama un método del service. */
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query({ schema: SupplierListQuery }) query: SupplierListQuery): Promise<SupplierList> {
    return this.suppliers.list(query);
  }

  @Get(':id')
  get(@Param('id', { schema: Id }) id: string): Promise<SupplierDto> {
    return this.suppliers.get(id);
  }

  @Post()
  create(
    @Body({ schema: CreateSupplierInput }) input: CreateSupplierInput,
    @Ctx() ctx: Ctx,
  ): Promise<SupplierDto> {
    return this.suppliers.create(input, ctx);
  }

  @Patch(':id')
  update(
    @Param('id', { schema: Id }) id: string,
    @Body({ schema: UpdateSupplierInput }) input: UpdateSupplierInput,
    @Ctx() ctx: Ctx,
  ): Promise<SupplierDto> {
    return this.suppliers.update(id, input, ctx);
  }
}

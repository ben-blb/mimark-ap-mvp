import { Injectable } from '@nestjs/common';
import type {
  CreateSupplierInput,
  SupplierListQuery,
  UpdateSupplierInput,
} from '@mimark/contracts/suppliers';
import { AppError } from '../../common/app-error.js';
import { Db, isUniqueViolation, type Tx } from '../../common/db.js';
import type { Prisma, Supplier } from '../../generated/prisma/client.js';

const DUPLICATE_TAX_ID = new AppError('CONFLICT', 'Ya existe un proveedor con ese RFC.', {
  fieldErrors: { taxId: 'Ya existe un proveedor con ese RFC' },
});

/** Única puerta a la tabla de proveedores. Solo el módulo suppliers escribe en ella. */
@Injectable()
export class SuppliersRepository {
  constructor(private readonly db: Db) {}

  list(query: SupplierListQuery): Promise<Supplier[]> {
    const where: Prisma.SupplierWhereInput = {};
    if (query.status !== 'all') where.active = query.status === 'active';
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { taxId: { contains: query.search.toUpperCase() } },
      ];
    }
    return this.db.supplier.findMany({ where, orderBy: { name: 'asc' } });
  }

  findById(id: string, tx: Tx = this.db): Promise<Supplier | null> {
    return tx.supplier.findUnique({ where: { id } });
  }

  findByTaxId(taxId: string, tx: Tx = this.db): Promise<Supplier | null> {
    return tx.supplier.findUnique({ where: { taxId } });
  }

  async create(data: CreateSupplierInput, tx: Tx = this.db): Promise<Supplier> {
    try {
      return await tx.supplier.create({ data });
    } catch (error) {
      if (isUniqueViolation(error)) throw DUPLICATE_TAX_ID;
      throw error;
    }
  }

  async update(id: string, data: UpdateSupplierInput, tx: Tx = this.db): Promise<Supplier> {
    try {
      return await tx.supplier.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw DUPLICATE_TAX_ID;
      throw error;
    }
  }
}

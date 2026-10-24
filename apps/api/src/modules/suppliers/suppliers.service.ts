import { Injectable } from '@nestjs/common';
import type {
  CreateSupplierInput,
  SupplierDto,
  SupplierList,
  SupplierListQuery,
  UpdateSupplierInput,
} from '@mimark/contracts/suppliers';
import { AppError } from '../../common/app-error.js';
import type { Ctx } from '../../common/ctx.js';
import { Db } from '../../common/db.js';
import type { Supplier } from '../../generated/prisma/client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { SuppliersRepository } from './suppliers.repository.js';

const AUDITED_FIELDS = ['name', 'taxId', 'creditDays', 'currency', 'active'] as const;

/**
 * Casos de uso de proveedores. Es el módulo plantilla: un módulo nuevo copia esta forma.
 * Cada método se lee de arriba abajo y cada escritura va con su auditoría en la misma transacción.
 */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly db: Db,
    private readonly suppliers: SuppliersRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(query: SupplierListQuery): Promise<SupplierList> {
    const rows = await this.suppliers.list(query);
    return { items: rows.map(toSupplierDto) };
  }

  async get(id: string): Promise<SupplierDto> {
    const supplier = await this.suppliers.findById(id);
    if (!supplier) throw new AppError('NOT_FOUND', 'No existe ese proveedor.');
    return toSupplierDto(supplier);
  }

  create(input: CreateSupplierInput, ctx: Ctx): Promise<SupplierDto> {
    return this.db.$transaction(async (tx) => {
      const supplier = await this.suppliers.create(input, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'supplier',
          entityId: supplier.id,
          action: 'supplier.created',
          data: { after: input },
        },
        tx,
      );
      return toSupplierDto(supplier);
    });
  }

  update(id: string, input: UpdateSupplierInput, ctx: Ctx): Promise<SupplierDto> {
    return this.db.$transaction(async (tx) => {
      const before = await this.suppliers.findById(id, tx);
      if (!before) throw new AppError('NOT_FOUND', 'No existe ese proveedor.');

      const after = await this.suppliers.update(id, input, tx);
      const changes = diffFields(before, after, AUDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await this.audit.log(
          {
            ...ctx,
            entity: 'supplier',
            entityId: id,
            action: 'supplier.updated',
            data: { changes },
          },
          tx,
        );
      }
      return toSupplierDto(after);
    });
  }
}

function toSupplierDto(supplier: Supplier): SupplierDto {
  return {
    id: supplier.id,
    name: supplier.name,
    taxId: supplier.taxId,
    creditDays: supplier.creditDays,
    currency: supplier.currency,
    active: supplier.active,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

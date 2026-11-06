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
import { Db, type Tx } from '../../common/db.js';
import type { Supplier } from '../../generated/prisma/client.js';
import { AuditRepository } from '../audit/audit.repository.js';
import { diffFields } from '../audit/audit.rules.js';
import { SuppliersRepository } from './suppliers.repository.js';
import { normalizeName } from './suppliers.rules.js';

const AUDITED_FIELDS = [
  'name',
  'taxId',
  'parlevelName',
  'creditDays',
  'currency',
  'active',
] as const;

const DUPLICATE_PARLEVEL_NAME = () =>
  new AppError('CONFLICT', 'Ya hay un proveedor con ese nombre en ParLevel.', {
    fieldErrors: { parlevelName: 'Ya hay un proveedor con ese nombre en ParLevel' },
  });

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
      const data = withNormalizedAlias(input);
      await this.checkAliasFree(data.parlevelName, null, tx);
      const supplier = await this.suppliers.create(data, tx);
      await this.audit.log(
        {
          ...ctx,
          entity: 'supplier',
          entityId: supplier.id,
          action: 'supplier.created',
          data: { after: data },
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

      const data = withNormalizedAlias(input);
      await this.checkAliasFree(data.parlevelName, id, tx);
      const after = await this.suppliers.update(id, data, tx);
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

  /** El alias de ParLevel es único: dos proveedores con el mismo nombre en el PDF no se distinguirían. */
  private async checkAliasFree(
    parlevelName: string | undefined,
    ownId: string | null,
    tx: Tx,
  ): Promise<void> {
    if (!parlevelName) return;
    const owner = await this.suppliers.findByParlevelName(parlevelName, tx);
    if (owner && owner.id !== ownId) throw DUPLICATE_PARLEVEL_NAME();
  }
}

function withNormalizedAlias<T extends { parlevelName?: string }>(input: T): T {
  return input.parlevelName === undefined
    ? input
    : { ...input, parlevelName: normalizeName(input.parlevelName) };
}

function toSupplierDto(supplier: Supplier): SupplierDto {
  return {
    id: supplier.id,
    name: supplier.name,
    taxId: supplier.taxId,
    parlevelName: supplier.parlevelName,
    creditDays: supplier.creditDays,
    currency: supplier.currency,
    active: supplier.active,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

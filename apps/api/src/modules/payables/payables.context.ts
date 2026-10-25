import { Injectable } from '@nestjs/common';
import { moneyToCents } from '../../common/money.js';
import { PurchaseOrdersRepository } from '../purchase-orders/purchase-orders.repository.js';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';
import { PayablesRepository } from './payables.repository.js';
import type { Facts, PayableContext } from './payables.rules.js';

/**
 * Arma el contexto que necesita `evaluatePayable` (OC, duplicados, otro expediente de la misma OC) con datos
 * frescos. Lo comparten la carga, la corrección y la confirmación; solo lee.
 */
@Injectable()
export class PayableContextLoader {
  constructor(
    private readonly payables: PayablesRepository,
    private readonly orders: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersRepository,
  ) {}

  async load(input: {
    facts: Facts;
    selectedPoNumber: string | null;
    /** El expediente que se evalúa: no se compara consigo mismo y solo lo bloquean los más antiguos. */
    self: { id: string; createdAt: Date };
  }) {
    const { facts, selectedPoNumber, self } = input;
    const lookup = selectedPoNumber ?? facts.poNumber;
    const po = lookup ? await this.orders.findByNumber(lookup) : null;
    const supplier =
      po?.supplier ??
      (facts.supplierTaxId ? await this.suppliers.findByTaxId(facts.supplierTaxId) : null);
    const context: PayableContext = {
      selectedPoNumber,
      purchaseOrder: po && {
        number: po.number,
        status: po.status,
        totalCents: moneyToCents(po.total.toFixed(2)),
        currency: po.currency,
        receiptStatus: po.receiptStatus,
        supplierTaxId: po.supplier.taxId,
      },
      duplicateOf: await this.payables.findLiveDuplicate({
        ...facts,
        excludeId: self.id,
        createdAt: self.createdAt,
      }),
      otherPayableForPo: po
        ? await this.payables.findLiveForPurchaseOrder(po.id, self.id, self.createdAt)
        : null,
    };
    return { context, po, supplier };
  }
}

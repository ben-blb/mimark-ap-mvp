import type { Currency } from '@mimark/contracts/common';
import type { PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import type { Role } from '@mimark/contracts/session';

/** Todas las etiquetas visibles de los valores de contracts. Cada spec agrega las suyas aquí. */

export const ROLE_LABELS: Record<Role, string> = {
  purchasing: 'Compras',
  warehouse: 'Almacén',
  payables: 'Cuentas por pagar',
  manager: 'Gerencia',
  admin: 'Administración',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  MXN: 'MXN · Peso mexicano',
  USD: 'USD · Dólar estadounidense',
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderDto['status'], string> = {
  open: 'Abierta',
  cancelled: 'Cancelada',
};

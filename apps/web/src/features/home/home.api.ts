import type { Permission } from '@mimark/contracts/permissions';
import { PayableList, type PayableStatus } from '@mimark/contracts/payables';
import { PurchaseOrderList } from '@mimark/contracts/purchase-orders';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { formatDay, formatMoney } from '../../lib/format';

/** Lo que muestra una fila de «Mi trabajo»: se abre en `to`. */
export interface WorkRow {
  id: string;
  title: string;
  detail: string;
  to: string;
}

export interface WorkBlock {
  key: string;
  title: string;
  /** Permiso que da el bloque (spec 017, AC-017-10). */
  permission: Permission;
  /** Lista ya filtrada a la que lleva «Ver todas». */
  seeAll: string;
  load: () => Promise<WorkRow[]>;
}

const payableBlock = (
  key: string,
  title: string,
  status: PayableStatus,
  detail: (p: PayableList['items'][number]) => string,
  order: (a: PayableList['items'][number], b: PayableList['items'][number]) => number = () => 0,
): WorkBlock => ({
  key,
  title,
  permission: 'payables:write',
  seeAll: `/expedientes?status=${status}`,
  load: async () => {
    const list = await api.get(`/payables?status=${status}`, PayableList);
    return list.items.sort(order).map((p) => ({
      id: p.id,
      title: p.supplierName ?? p.fileName,
      detail: detail(p),
      to: `/expedientes/${p.id}`,
    }));
  },
});

const invoiceDetail = (p: PayableList['items'][number]) =>
  [
    p.invoiceNumber,
    p.total && p.currency ? formatMoney(p.total, p.currency) : null,
    p.dueOn ? `vence ${formatDay(p.dueOn)}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || p.fileName;

/** Las más vencidas primero; sin fecha al final. */
const byDueOn = (a: PayableList['items'][number], b: PayableList['items'][number]) =>
  (a.dueOn ?? '9999-12-31').localeCompare(b.dueOn ?? '9999-12-31');

/** Un bloque por tipo de pendiente, en el orden en que se muestran. Reusa los listados que ya existen. */
export const WORK_BLOCKS: readonly WorkBlock[] = [
  {
    key: 'receipts',
    title: 'Órdenes por recibir',
    permission: 'orders:write',
    seeAll: '/ordenes?view=openPending',
    load: async () => {
      const list = await api.get('/purchase-orders?status=open&receipt=pending', PurchaseOrderList);
      return list.items.map((o) => ({
        id: o.id,
        title: `${o.number} · ${o.supplier.name}`,
        detail: `emitida ${formatDay(o.issuedOn)}`,
        to: '/ordenes?view=openPending',
      }));
    },
  },
  payableBlock('review', 'Facturas por revisar', 'requires_review', invoiceDetail),
  payableBlock('confirm', 'Por confirmar', 'pending_confirmation', invoiceDetail),
  payableBlock('schedule', 'Por programar', 'confirmed', invoiceDetail),
  payableBlock('scheduled', 'Pagos programados', 'scheduled', invoiceDetail, byDueOn),
];

/** Carga los bloques que el rol puede ver. Cada uno es su propia consulta: uno lento no frena a los demás. */
export function useMyWork(can: (permission: Permission) => boolean) {
  const blocks = WORK_BLOCKS.filter((block) => can(block.permission));
  const results = useQueries({
    queries: blocks.map((block) => ({
      queryKey: ['my-work', block.key] as const,
      queryFn: block.load,
    })),
  });
  return blocks.map((block, i) => ({ block, query: results[i]! }));
}

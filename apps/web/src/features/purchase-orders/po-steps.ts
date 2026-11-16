import type { PoStage, PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import type { FlowStep } from '../../components/FlowSteps';
import { formatDay } from '../../lib/format';
import { PO_STAGE_LABELS } from '../../lib/labels';

/** Paso (índice en `STEPS`) en el que está cada etapa. `cancelled` no dibuja barra. */
const CURRENT: Record<Exclude<PoStage, 'cancelled'>, number> = {
  to_receive: 1,
  to_invoice: 2,
  in_review: 3,
  to_schedule: 4,
  scheduled: 5,
  paid: 5,
};
const STEPS = ['Creada', 'Recibida', 'Facturada', 'Confirmada', 'Programada', 'Pagada'] as const;

/** Convierte la etapa de la orden en los pasos de la barra: los anteriores al actual están cumplidos. */
export function poFlowSteps(order: PurchaseOrderDto): FlowStep[] {
  const { stage, invoice } = order.progress;
  if (stage === 'cancelled') return [];
  const current = CURRENT[stage];
  const dates: (string | null)[] = [
    order.createdAt.slice(0, 10),
    order.receivedOn,
    null,
    null,
    invoice?.scheduledPayOn ?? null,
    invoice?.paidOn ?? null,
  ];
  return STEPS.map((label, i) => ({
    label,
    done: i < current || (stage === 'paid' && i === current),
    current: i === current,
    currentText: PO_STAGE_LABELS[stage],
    detail: dates[i] ? formatDay(dates[i]) : undefined,
  }));
}

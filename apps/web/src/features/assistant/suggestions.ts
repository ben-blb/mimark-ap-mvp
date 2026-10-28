import type { AssistantToolName } from '@mimark/contracts/assistant';
import type { DashboardDto } from '@mimark/contracts/dashboard';
import { PayableDto, PayableList } from '@mimark/contracts/payables';

export interface Suggestion {
  /** Lo que se ve en el chip. */
  label: string;
  /** Lo que se escribe en el compositor. */
  prompt: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Sugerencias de la conversación vacía (AC-010-08), armadas con el tablero a 7 días. Sin datos, quedan las
 * preguntas generales.
 */
export function startSuggestions(dashboard: DashboardDto | undefined): Suggestion[] {
  const list: Suggestion[] = [];
  const upcoming = dashboard?.totals.upcoming.count ?? 0;
  const overdue = dashboard?.totals.overdue.count ?? 0;
  const inReview = dashboard?.inReview ?? 0;
  if (overdue > 0) {
    list.push({
      label: `${plural(overdue, 'factura vencida', 'facturas vencidas')} — ¿cuáles?`,
      prompt: '¿Qué facturas están vencidas?',
    });
  }
  if (upcoming > 0) {
    list.push({
      label: `${plural(upcoming, 'factura vence', 'facturas vencen')} esta semana — ¿cuáles?`,
      prompt: '¿Qué facturas vencen en los próximos 7 días?',
    });
  }
  if (inReview > 0) {
    list.push({
      label: `${plural(inReview, 'expediente espera', 'expedientes esperan')} revisión — ¿qué les falta?`,
      prompt: '¿Qué expedientes están en revisión y qué les falta?',
    });
  }
  const next = dashboard?.byPayDay[0];
  if (next && list.length < 3) {
    list.push({
      label: `¿Qué se paga el próximo día de pago?`,
      prompt: `¿Qué facturas se pagan el ${next.payOn}?`,
    });
  }
  if (list.length === 0) {
    list.push({ label: '¿Qué vence esta semana?', prompt: '¿Qué vence en los próximos 7 días?' });
  }
  list.push({ label: 'Sube una factura PDF para validarla', prompt: 'Sube esta factura' });
  return list.slice(0, 4);
}

/**
 * Seguimientos después de una respuesta (AC-010-08): 2–3, según el último resultado de herramienta que se
 * mostró. Sin resultado reconocible, ninguno.
 */
export function followUpSuggestions(
  last: { name: AssistantToolName; value: unknown } | undefined,
): Suggestion[] {
  if (!last) return [];
  if (last.name === 'listPayables') {
    const parsed = PayableList.safeParse(last.value);
    if (!parsed.success || parsed.data.items.length === 0) return [];
    const items = parsed.data.items.filter((p) => p.invoiceNumber);
    const out: Suggestion[] = [];
    const [first, second] = items;
    if (first && second) {
      out.push({
        label: `Ver detalle de ${first.invoiceNumber} y ${second.invoiceNumber}`,
        prompt: `Muéstrame el detalle de ${first.invoiceNumber} y ${second.invoiceNumber}`,
      });
    } else if (first) {
      out.push({
        label: `Ver detalle de ${first.invoiceNumber}`,
        prompt: `Muéstrame el detalle de ${first.invoiceNumber}`,
      });
    }
    const toSchedule = items.find((p) => p.status === 'confirmed');
    if (toSchedule) {
      out.push({
        label: `Programar ${toSchedule.invoiceNumber}`,
        prompt: `Programa el pago de ${toSchedule.invoiceNumber}`,
      });
    }
    const toReview = items.find((p) => p.status === 'requires_review');
    if (toReview) {
      out.push({
        label: `¿Qué le falta a ${toReview.invoiceNumber}?`,
        prompt: `¿Qué le falta a ${toReview.invoiceNumber} para confirmarse?`,
      });
    }
    return out.slice(0, 3);
  }
  if (last.name === 'getPayable') {
    const parsed = PayableDto.safeParse(last.value);
    if (!parsed.success) return [];
    const p = parsed.data;
    const folio = p.fields.invoiceNumber ?? p.file.name;
    const out: Suggestion[] = [];
    if (p.allowedActions.includes('schedule')) {
      out.push({ label: `Programar ${folio}`, prompt: `Programa el pago de ${folio}` });
    }
    if (p.allowedActions.includes('confirm')) {
      out.push({ label: `Confirmar ${folio}`, prompt: `Confirma el expediente ${folio}` });
    }
    out.push({ label: 'Ver historial', prompt: `Muéstrame el historial de ${folio}` });
    return out.slice(0, 3);
  }
  if (last.name === 'getDashboard') {
    return [
      { label: '¿Cuáles están vencidas?', prompt: '¿Qué facturas están vencidas?' },
      { label: 'Ver las de esta semana', prompt: '¿Qué facturas vencen en los próximos 7 días?' },
    ];
  }
  return [];
}

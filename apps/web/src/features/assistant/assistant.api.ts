import {
  ASSISTANT_TOOLS,
  AssistantStreamEvent,
  type AssistantToolCall,
  type AssistantToolName,
  type AssistantTurnInput,
  type AssistantTurnOutput,
  MAX_TOOL_RESULT,
} from '@mimark/contracts/assistant';
import { DashboardDto } from '@mimark/contracts/dashboard';
import { PayableDto, PayableHistory, PayableList } from '@mimark/contracts/payables';
import { PurchaseOrderDto, PurchaseOrderList } from '@mimark/contracts/purchase-orders';
import { SupplierDto, SupplierList } from '@mimark/contracts/suppliers';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api, toQuery } from '../../lib/api-client';
import { dashboardKey } from '../dashboard/dashboard.api';
import { payableKeys } from '../payables/payables.api';
import { purchaseOrderKeys } from '../purchase-orders/purchase-orders.api';
import { supplierKeys } from '../suppliers/suppliers.api';

/**
 * Un turno del asistente en streaming (spec 010, AC-010-06): `onDelta` recibe el texto mientras llega y la promesa
 * resuelve con el turno completo. `signal` lo detiene.
 */
export async function streamTurn(
  input: AssistantTurnInput,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AssistantTurnOutput> {
  let out: AssistantTurnOutput | null = null;
  await api.stream(
    '/assistant/stream',
    input,
    AssistantStreamEvent,
    (event) => {
      if (event.type === 'delta') onDelta(event.text);
      else if (event.type === 'done') out = { text: event.text, toolCalls: event.toolCalls };
      else throw new ApiError(502, event.code, event.message);
    },
    signal,
  );
  if (!out) throw new ApiError(502, 'AI_UNAVAILABLE', 'El asistente no terminó de responder.');
  return out;
}

export const isWrite = (name: AssistantToolName) => ASSISTANT_TOOLS[name].kind === 'write';

type Params = Record<string, string | number | boolean | undefined>;
type Runner = (input: Params, file: File | null) => Promise<unknown>;

/** Separa el id de la ruta del resto de la entrada (el cuerpo). */
function split(input: Params): [string, Params] {
  const { id, ...body } = input;
  return [encodeURIComponent(String(id)), body];
}

/**
 * Cada herramienta llama al mismo endpoint que usan las pantallas. La API ya validó la entrada al proponerla
 * y el endpoint la vuelve a validar con el mismo esquema.
 */
const RUNNERS: Record<AssistantToolName, Runner> = {
  listSuppliers: (q) => api.get(`/suppliers${toQuery(q)}`, SupplierList),
  listPurchaseOrders: (q) => api.get(`/purchase-orders${toQuery(q)}`, PurchaseOrderList),
  listPayables: (q) => api.get(`/payables${toQuery(q)}`, PayableList),
  getPayable: (q) => api.get(`/payables/${split(q)[0]}`, PayableDto),
  getPayableHistory: (q) => api.get(`/payables/${split(q)[0]}/history`, PayableHistory),
  getDashboard: (q) => api.get(`/dashboard${toQuery(q)}`, DashboardDto),
  createSupplier: (body) => api.post('/suppliers', body, SupplierDto),
  updateSupplier: (q) => {
    const [id, body] = split(q);
    return api.patch(`/suppliers/${id}`, body, SupplierDto);
  },
  createPurchaseOrder: (body) => api.post('/purchase-orders', body, PurchaseOrderDto),
  recordReceipt: (q) => {
    const [id, body] = split(q);
    return api.post(`/purchase-orders/${id}/receipt`, body, PurchaseOrderDto);
  },
  uploadPayable: (fields, file) => {
    if (!file) throw new Error('Adjunta la factura');
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== '') form.append(key, String(value));
    }
    return api.upload('/payables', form, PayableDto);
  },
  retryPayable: (q) => api.post(`/payables/${split(q)[0]}/retry`, undefined, PayableDto),
  correctFields: (q) => {
    const [id, body] = split(q);
    return api.patch(`/payables/${id}/fields`, body, PayableDto);
  },
  confirmPayable: (q) => api.post(`/payables/${split(q)[0]}/confirm`, undefined, PayableDto),
  schedulePayable: (q) => {
    const [id, body] = split(q);
    return api.post(`/payables/${id}/schedule`, body, PayableDto);
  },
  recordPayment: (q) => {
    const [id, body] = split(q);
    return api.post(`/payables/${id}/payment`, body, PayableDto);
  },
  updateDocuments: (q) => {
    const [id, body] = split(q);
    return api.patch(`/payables/${id}/documents`, body, PayableDto);
  },
  discardPayable: (q) => {
    const [id, body] = split(q);
    return api.post(`/payables/${id}/discard`, body, PayableDto);
  },
};

/** Resultado de una herramienta como texto para el asistente; un error también es un resultado. */
export function toToolResult(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > MAX_TOOL_RESULT
    ? `${text.slice(0, MAX_TOOL_RESULT - 20)}…(recortado)`
    : text;
}

export interface ToolOutcome {
  /** Lo que se envía al asistente. */
  result: string;
  /** La respuesta del endpoint ya validada, para dibujarla (AC-010-07). */
  value?: unknown;
  /** Mensaje para la persona si la llamada falló. */
  error?: string;
  /** Lo que tardó, en milisegundos. */
  ms: number;
}

/** Ejecuta una llamada del asistente. Después de una escritura recarga lo que pudo cambiar. */
export function useRunTool() {
  const queryClient = useQueryClient();
  return async (call: AssistantToolCall, file: File | null): Promise<ToolOutcome> => {
    const started = performance.now();
    const ms = () => Math.round(performance.now() - started);
    try {
      const value = await RUNNERS[call.name]((call.input ?? {}) as Params, file);
      return { result: toToolResult(value), value, ms: ms() };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
      return { result: toToolResult({ error }), error, ms: ms() };
    } finally {
      if (isWrite(call.name)) {
        await Promise.all(
          [supplierKeys.all, purchaseOrderKeys.all, payableKeys.all, dashboardKey].map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }
    }
  };
}

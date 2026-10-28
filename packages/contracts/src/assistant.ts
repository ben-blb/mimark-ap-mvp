import { z } from 'zod';
import { Id } from './common.js';
import { ErrorCode } from './errors.js';
import { DashboardQuery } from './dashboard.js';
import {
  ALLOWED_MIME_TYPES,
  CorrectFieldsInput,
  DiscardInput,
  DocumentsInput,
  MAX_FILE_BYTES,
  PayableListQuery,
  PaymentInput,
  ScheduleInput,
  UploadPayableInput,
} from './payables.js';
import {
  CreatePurchaseOrderInput,
  PurchaseOrderListQuery,
  ReceiptInput,
} from './purchase-orders.js';
import { CreateSupplierInput, SupplierListQuery, UpdateSupplierInput } from './suppliers.js';

const ById = z.object({ id: Id });

/**
 * Catálogo único de herramientas del asistente (spec 008). La API se lo da al modelo; la web decide con
 * `kind` si la ejecuta sola (lectura) o la muestra como propuesta que una persona confirma (escritura).
 */
export const ASSISTANT_TOOLS = {
  listSuppliers: {
    kind: 'read',
    description: 'Lista proveedores. Filtra por texto (nombre o RFC) y estado.',
    input: SupplierListQuery,
  },
  listPurchaseOrders: {
    kind: 'read',
    description:
      'Lista órdenes de compra. Filtra por texto (folio), proveedor, recepción y estado.',
    input: PurchaseOrderListQuery,
  },
  listPayables: {
    kind: 'read',
    description:
      'Lista expedientes de facturas. Filtros: status (uno o varios separados por comas), search, supplierId, ' +
      'poNumber, invoiceNumber, due (overdue, 7, 15 o 30 días).',
    input: PayableListQuery,
  },
  getPayable: {
    kind: 'read',
    description:
      'Detalle de un expediente por id: campos, estado, razones de revisión y acciones permitidas.',
    input: ById,
  },
  getPayableHistory: {
    kind: 'read',
    description: 'Historial de auditoría de un expediente por id.',
    input: ById,
  },
  getDashboard: {
    kind: 'read',
    description:
      'Tablero de cartera: por pagar, vencidos, próximos y pagados del mes en 7, 15 o 30 días.',
    input: DashboardQuery,
  },
  createSupplier: {
    kind: 'write',
    description: 'Propone dar de alta un proveedor.',
    input: CreateSupplierInput,
  },
  updateSupplier: {
    kind: 'write',
    description: 'Propone cambiar datos de un proveedor (o activarlo/desactivarlo).',
    input: UpdateSupplierInput.extend({ id: Id }),
  },
  createPurchaseOrder: {
    kind: 'write',
    description: 'Propone registrar una orden de compra.',
    input: CreatePurchaseOrderInput,
  },
  recordReceipt: {
    kind: 'write',
    description:
      'Propone confirmar la recepción de la mercancía de una orden de compra (id de la OC).',
    input: ReceiptInput.extend({ id: Id }),
  },
  uploadPayable: {
    kind: 'write',
    description:
      'Propone subir la factura adjunta en el chat para extraer sus datos. Solo si hay adjunto.',
    input: UploadPayableInput,
  },
  retryPayable: {
    kind: 'write',
    description: 'Propone reintentar la extracción de un expediente fallido.',
    input: ById,
  },
  correctFields: {
    kind: 'write',
    description: 'Propone corregir campos de un expediente. Solo los campos que cambian.',
    input: CorrectFieldsInput.extend({ id: Id }),
  },
  confirmPayable: {
    kind: 'write',
    description: 'Propone confirmar un expediente revisado.',
    input: ById,
  },
  schedulePayable: {
    kind: 'write',
    description: 'Propone programar el pago de un expediente; sin payOn usa el día sugerido.',
    input: ScheduleInput.extend({ id: Id }),
  },
  recordPayment: {
    kind: 'write',
    description: 'Propone anotar un pago YA hecho fuera del sistema (fecha, importe y referencia).',
    input: PaymentInput.extend({ id: Id }),
  },
  updateDocuments: {
    kind: 'write',
    description:
      'Propone marcar como recibidos o pendientes la factura física o el complemento de pago.',
    input: DocumentsInput.extend({ id: Id }),
  },
  discardPayable: {
    kind: 'write',
    description: 'Propone descartar un expediente, con motivo.',
    input: DiscardInput.extend({ id: Id }),
  },
} as const satisfies Record<
  string,
  { kind: 'read' | 'write'; description: string; input: z.ZodType }
>;

export type AssistantToolName = keyof typeof ASSISTANT_TOOLS;
export const AssistantToolName = z.enum(
  Object.keys(ASSISTANT_TOOLS) as [AssistantToolName, ...AssistantToolName[]],
);

export const MAX_ASSISTANT_MESSAGES = 40;
export const MAX_ASSISTANT_TEXT = 2000;
export const MAX_TOOL_RESULT = 20_000;

/** `input` es lo que escribió el modelo, ya validado con el esquema de su herramienta. */
export const AssistantToolCall = z.object({
  id: z.string().min(1).max(100),
  name: AssistantToolName,
  input: z.unknown(),
});
export type AssistantToolCall = z.infer<typeof AssistantToolCall>;

export const AssistantMessage = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string().trim().min(1).max(MAX_ASSISTANT_TEXT) }),
  z.object({
    role: z.literal('assistant'),
    text: z.string().max(2 * MAX_ASSISTANT_TEXT),
    toolCalls: z.array(AssistantToolCall).max(5),
  }),
  z.object({
    role: z.literal('tool'),
    toolCallId: z.string().min(1).max(100),
    name: AssistantToolName,
    /** Resultado de la herramienta como texto JSON. */
    result: z.string().max(MAX_TOOL_RESULT),
  }),
]);
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const AssistantAttachment = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().min(1).max(MAX_FILE_BYTES),
});
export type AssistantAttachment = z.infer<typeof AssistantAttachment>;

export const AssistantTurnInput = z.object({
  messages: z.array(AssistantMessage).min(1).max(MAX_ASSISTANT_MESSAGES),
  attachment: AssistantAttachment.optional(),
});
export type AssistantTurnInput = z.infer<typeof AssistantTurnInput>;

export const AssistantTurnOutput = z.object({
  text: z.string(),
  toolCalls: z.array(AssistantToolCall),
});
export type AssistantTurnOutput = z.infer<typeof AssistantTurnOutput>;

/**
 * Eventos de `POST /assistant/stream` (spec 010, AC-010-06), uno por línea `data:` del SSE: el texto llega en
 * trozos y el turno termina con `done` (mismo contenido que `/turn`) o con `error`.
 */
export const AssistantStreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done') }).extend(AssistantTurnOutput.shape),
  z.object({ type: z.literal('error'), code: ErrorCode, message: z.string() }),
]);
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEvent>;

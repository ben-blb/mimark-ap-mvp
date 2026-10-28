import type { AssistantToolName } from '@mimark/contracts/assistant';
import type { Currency } from '@mimark/contracts/common';
import type { DOC_TYPES, ExtractedField } from '@mimark/contracts/extraction';
import type { PayableDto, PayableStatus, REVIEW_REASON_CODES } from '@mimark/contracts/payables';
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

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  uploaded: 'Subido',
  processing: 'Procesando',
  requires_review: 'En revisión',
  pending_confirmation: 'Por confirmar',
  confirmed: 'Confirmado',
  scheduled: 'Programado',
  paid: 'Pagado',
  out_of_scope: 'Fuera de alcance',
  failed: 'Con error',
  discarded: 'Descartado',
};

export const REVIEW_REASON_LABELS: Record<(typeof REVIEW_REASON_CODES)[number], string> = {
  NOT_AP_DOCUMENT: 'No es un documento de compra',
  MISSING_FIELD: 'Falta un dato obligatorio',
  UNCERTAIN_FIELD: 'Un dato no se lee con claridad',
  PO_NOT_FOUND: 'No existe la OC',
  PO_MISMATCH: 'La OC del documento no es la que elegiste',
  PO_CANCELLED: 'La OC está cancelada',
  PO_ALREADY_INVOICED: 'La OC ya tiene otro expediente',
  TAX_ID_MISMATCH: 'El RFC no coincide con el de la OC',
  CURRENCY_MISMATCH: 'La moneda no coincide con la OC',
  TOTAL_MISMATCH: 'El total no coincide con la OC',
  RECEIPT_NOT_CONFIRMED: 'La OC no tiene recepción confirmada',
  DUPLICATE: 'Posible duplicado de otro expediente',
};

export const FIELD_LABELS: Record<ExtractedField, string> = {
  supplierName: 'Proveedor',
  supplierTaxId: 'RFC del proveedor',
  invoiceNumber: 'Factura',
  issueDate: 'Fecha de emisión',
  purchaseOrderNumber: 'Orden de compra',
  subtotal: 'Subtotal',
  taxes: 'Impuestos',
  total: 'Total',
  currency: 'Moneda',
  taxUuid: 'UUID fiscal',
};

export const DOC_TYPE_LABELS: Record<(typeof DOC_TYPES)[number], string> = {
  factura: 'Factura',
  ticket: 'Ticket',
  remision: 'Remisión',
  otro: 'Otro',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'payable.uploaded': 'Documento subido',
  'payable.processing': 'Procesando',
  'payable.extracted': 'Lectura con IA',
  'payable.evaluated': 'Reglas aplicadas',
  'payable.failed': 'Falló la lectura',
  'payable.corrected': 'Datos corregidos',
  'payable.confirmed': 'Confirmado',
  'payable.review_required': 'Devuelto a revisión',
  'payable.scheduled': 'Pago programado',
  'payable.paid': 'Pago registrado',
  'payable.documents': 'Documentos actualizados',
  'payable.discarded': 'Descartado',
};

export const PAYABLE_ACTION_LABELS: Record<PayableDto['allowedActions'][number], string> = {
  retry: 'Reintentar',
  correct: 'Corregir',
  confirm: 'Confirmar',
  schedule: 'Programar pago',
  pay: 'Registrar pago',
  documents: 'Documentos',
  discard: 'Descartar',
};

/** Lo que se ve mientras corre una lectura del asistente (AC-010-07). */
export const ASSISTANT_TOOL_PROGRESS: Partial<Record<AssistantToolName, string>> = {
  listSuppliers: 'Consultando proveedores',
  listPurchaseOrders: 'Consultando órdenes de compra',
  listPayables: 'Consultando expedientes',
  getPayable: 'Consultando el expediente',
  getPayableHistory: 'Consultando el historial',
  getDashboard: 'Consultando el tablero',
};

export const ASSISTANT_TOOL_LABELS: Record<AssistantToolName, string> = {
  listSuppliers: 'Consultar proveedores',
  listPurchaseOrders: 'Consultar órdenes de compra',
  listPayables: 'Consultar expedientes',
  getPayable: 'Consultar un expediente',
  getPayableHistory: 'Consultar historial de un expediente',
  getDashboard: 'Consultar el tablero',
  createSupplier: 'Dar de alta un proveedor',
  updateSupplier: 'Cambiar un proveedor',
  createPurchaseOrder: 'Registrar una orden de compra',
  recordReceipt: 'Confirmar recepción de una orden de compra',
  uploadPayable: 'Subir la factura adjunta',
  retryPayable: 'Reintentar la extracción',
  correctFields: 'Corregir campos de un expediente',
  confirmPayable: 'Confirmar un expediente',
  schedulePayable: 'Programar un pago',
  recordPayment: 'Registrar un pago ya hecho',
  updateDocuments: 'Actualizar documentos de un expediente',
  discardPayable: 'Descartar un expediente',
};

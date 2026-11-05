import { CURRENCIES } from '@mimark/contracts/common';
import {
  CreatePurchaseOrderInput,
  type PurchaseOrderDraft,
  type PurchaseOrderDto,
  PoLineInput,
  totalWithVat,
} from '@mimark/contracts/purchase-orders';
import type { SupplierDto } from '@mimark/contracts/suppliers';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { paymentTermLabel } from '../../lib/format';
import { CURRENCY_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { useZodForm } from '../../lib/use-zod-form';
import { useState } from 'react';
import { EMPTY_LINE, type LineValues, PoLinesEditor } from './PoLinesEditor';

const PurchaseOrderFormSchema = CreatePurchaseOrderInput.extend({
  supplierId: z.string().min(1, 'Elige un proveedor'),
  status: z.enum(['open', 'cancelled']),
  // En una edición una OC anterior a la spec 014 puede no tener partidas (la API las exige solo al crear).
  lines: z.array(PoLineInput).max(200),
});
export type PurchaseOrderFormValues = z.output<typeof PurchaseOrderFormSchema>;

export type SupplierOption = Pick<SupplierDto, 'id' | 'name' | 'creditDays' | 'currency'>;

interface Props {
  /** Sin `order` es un alta; con ella, una edición (folio y proveedor no cambian). */
  order?: PurchaseOrderDto;
  suppliers: SupplierOption[];
  /** Fecha de hoy 'AAAA-MM-DD': valor inicial y tope de la fecha de la OC. */
  today: string;
  /** Borrador que leyó la IA del PDF: prellena el formulario y pide verificarlo antes de guardar. */
  draft?: PurchaseOrderDraft;
  /** Proveedor recién registrado desde el borrador: queda elegido sin perder lo editado (spec 015). */
  registeredSupplierId?: string;
  /** Sin esta función (falta permiso) no se ofrece «Registrar proveedor». */
  onRegisterSupplier?: (suggestion: NonNullable<PurchaseOrderDraft['supplierSuggestion']>) => void;
  pending: boolean;
  error: unknown;
  onSubmit: (values: PurchaseOrderFormValues) => void;
  onCancel: () => void;
}

/** Formulario puro: no sabe de la API. Lo usa PurchaseOrderDialog y lo prueban sin red. */
export function PurchaseOrderForm({
  order,
  suppliers,
  today,
  draft,
  registeredSupplierId,
  onRegisterSupplier,
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const form = useZodForm(
    PurchaseOrderFormSchema,
    order
      ? {
          ...order,
          supplierId: order.supplier.id,
          parlevelRef: order.parlevelRef ?? '',
          lines: order.lines.map(toLineValues),
        }
      : draft
        ? fromDraft(draft, today)
        : {
            number: '',
            supplierId: '',
            issuedOn: today,
            total: '',
            currency: 'MXN',
            parlevelRef: '',
            status: 'open',
            lines: [EMPTY_LINE],
          },
    serverErrors,
  );
  const [reviewed, setReviewed] = useState(false);
  const uncertain = new Set(draft?.uncertainFields ?? []);
  const mustReview = (draft?.warnings.length ?? 0) > 0 && !reviewed;
  const linesLocked = order?.receiptStatus === 'received';
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;
  const hasFieldError = generalError && Object.keys(generalError.fieldErrors).length > 0;

  function chooseSupplier(id: string) {
    form.setValue('supplierId', id);
    const supplier = suppliers.find((s) => s.id === id);
    if (supplier) form.setValue('currency', supplier.currency);
  }

  // Un proveedor recién registrado queda elegido una sola vez (ajuste de estado al cambiar la prop).
  const [appliedSupplierId, setAppliedSupplierId] = useState(registeredSupplierId);
  if (registeredSupplierId && registeredSupplierId !== appliedSupplierId) {
    setAppliedSupplierId(registeredSupplierId);
    chooseSupplier(registeredSupplierId);
  }

  const suggestion =
    draft && !draft.supplier && !form.values.supplierId ? draft.supplierSuggestion : null;
  const matchedBy =
    draft?.supplierMatch && form.values.supplierId === draft.supplier?.id
      ? SUPPLIER_MATCH_LABELS[draft.supplierMatch]
      : null;
  const vatSubtotal = draft && draft.total === null ? draft.subtotal : null;

  /** Campos que la IA leyó con dudas se marcan en amarillo hasta que la persona los edita. */
  function checked(name: 'number' | 'issuedOn' | 'total' | 'currency' | 'parlevelRef') {
    const props = form.field(name);
    if (!uncertain.has(name) || form.errors[name]) return props;
    return { ...props, color: 'warning' as const, helperText: 'Verifícalo contra el PDF' };
  }

  return (
    <Stack component="form" spacing={1} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {order ? (
        <TextField label="Proveedor" value={order.supplier.name} disabled helperText=" " />
      ) : (
        <TextField
          label="Proveedor"
          select
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          {...form.field('supplierId')}
          helperText={form.errors.supplierId ?? matchedBy ?? ' '}
          onChange={(e) => chooseSupplier(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {paymentTermLabel(s.creditDays)}
            </option>
          ))}
        </TextField>
      )}
      {suggestion && (
        <Alert
          severity="info"
          aria-label="Proveedor del PDF"
          action={
            onRegisterSupplier && (
              <Button color="inherit" size="small" onClick={() => onRegisterSupplier(suggestion)}>
                Registrar proveedor
              </Button>
            )
          }
        >
          El PDF dice: {suggestion.name}
          {suggestion.city ? ` · ${suggestion.city}` : ''}.{' '}
          {onRegisterSupplier
            ? 'Regístralo o elige uno de la lista.'
            : `Pide a un administrador que registre a ${suggestion.name}.`}
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        <TextField label="Folio" disabled={Boolean(order)} {...checked('number')} />
        <TextField
          label="Fecha"
          type="date"
          slotProps={{ htmlInput: { max: today }, inputLabel: { shrink: true } }}
          {...checked('issuedOn')}
        />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}>
        <TextField
          label="Total con impuestos"
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          {...checked('total')}
        />
        {vatSubtotal && (
          <Button
            variant="outlined"
            size="small"
            sx={{ alignSelf: 'flex-start', mt: 1, flexShrink: 0 }}
            onClick={() => form.setValue('total', totalWithVat(vatSubtotal))}
          >
            Subtotal + IVA 16 %
          </Button>
        )}
        <TextField
          label="Moneda"
          select
          slotProps={{ select: { native: true } }}
          {...checked('currency')}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {CURRENCY_LABELS[currency]}
            </option>
          ))}
        </TextField>
      </Stack>
      <TextField label="Referencia ParLevel (opcional)" {...checked('parlevelRef')} />
      <PoLinesEditor
        lines={form.values.lines as LineValues[]}
        errors={form.errors}
        uncertain={uncertain.has('lines')}
        total={String(form.values.total ?? '')}
        currency={String(form.values.currency ?? 'MXN')}
        readOnly={linesLocked}
        onChange={(lines) => form.setValue('lines', lines)}
      />
      {order && (
        <TextField
          label="Estado"
          select
          slotProps={{ select: { native: true } }}
          {...form.field('status')}
        >
          {(['open', 'cancelled'] as const).map((status) => (
            <option key={status} value={status}>
              {PURCHASE_ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </TextField>
      )}
      {draft && draft.warnings.length > 0 && (
        <Alert severity="warning" aria-label="Avisos de la lectura del PDF">
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
            {draft.warnings.map((w) => (
              <li key={`${w.field}:${w.message}`}>{w.message}</li>
            ))}
          </Stack>
        </Alert>
      )}
      {draft && draft.warnings.length > 0 && (
        <FormControlLabel
          control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />}
          label="Revisé las partidas contra el PDF"
        />
      )}
      {generalError && !hasFieldError && <ErrorAlert error={generalError} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={pending} disabled={mustReview}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}

const SUPPLIER_MATCH_LABELS = {
  taxId: 'Reconocido por RFC',
  alias: 'Reconocido por su nombre en ParLevel',
  name: 'Reconocido por nombre: verifícalo',
} as const;

function toLineValues(line: PurchaseOrderDto['lines'][number]): LineValues {
  return {
    sku: line.sku ?? '',
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
  };
}

/** El borrador de la IA como valores iniciales: lo que no leyó queda vacío para que la persona lo capture. */
function fromDraft(draft: PurchaseOrderDraft, today: string) {
  return {
    number: draft.number ?? '',
    supplierId: draft.supplier?.id ?? '',
    issuedOn: draft.issuedOn ?? today,
    total: draft.total ?? '',
    currency: draft.currency ?? draft.supplier?.currency ?? 'MXN',
    parlevelRef: draft.parlevelRef ?? '',
    status: 'open' as const,
    lines:
      draft.lines.length > 0
        ? draft.lines.map((l) => ({
            sku: l.sku ?? '',
            description: l.description ?? '',
            quantity: l.quantity ?? '',
            unit: l.unit ?? '',
            unitPrice: l.unitPrice ?? '',
          }))
        : [EMPTY_LINE],
  };
}

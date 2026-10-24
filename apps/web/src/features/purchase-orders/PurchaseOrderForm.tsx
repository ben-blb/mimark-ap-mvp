import { CURRENCIES } from '@mimark/contracts/common';
import { CreatePurchaseOrderInput, type PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import type { SupplierDto } from '@mimark/contracts/suppliers';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { paymentTermLabel } from '../../lib/format';
import { CURRENCY_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { useZodForm } from '../../lib/use-zod-form';

const PurchaseOrderFormSchema = CreatePurchaseOrderInput.extend({
  supplierId: z.string().min(1, 'Elige un proveedor'),
  status: z.enum(['open', 'cancelled']),
});
export type PurchaseOrderFormValues = z.output<typeof PurchaseOrderFormSchema>;

export type SupplierOption = Pick<SupplierDto, 'id' | 'name' | 'creditDays' | 'currency'>;

interface Props {
  /** Sin `order` es un alta; con ella, una edición (folio y proveedor no cambian). */
  order?: PurchaseOrderDto;
  suppliers: SupplierOption[];
  /** Fecha de hoy 'AAAA-MM-DD': valor inicial y tope de la fecha de la OC. */
  today: string;
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
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const form = useZodForm(
    PurchaseOrderFormSchema,
    order
      ? { ...order, supplierId: order.supplier.id, parlevelRef: order.parlevelRef ?? '' }
      : {
          number: '',
          supplierId: '',
          issuedOn: today,
          total: '',
          currency: 'MXN',
          parlevelRef: '',
          status: 'open',
        },
    serverErrors,
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;
  const hasFieldError = generalError && Object.keys(generalError.fieldErrors).length > 0;

  function chooseSupplier(id: string) {
    form.setValue('supplierId', id);
    const supplier = suppliers.find((s) => s.id === id);
    if (supplier) form.setValue('currency', supplier.currency);
  }

  return (
    <Stack component="form" spacing={1} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {order ? (
        <TextField label="Proveedor" value={order.supplier.name} disabled helperText=" " />
      ) : (
        <TextField
          label="Proveedor"
          select
          slotProps={{ select: { native: true } }}
          {...form.field('supplierId')}
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
      <Stack direction="row" spacing={2}>
        <TextField label="Folio" disabled={Boolean(order)} {...form.field('number')} />
        <TextField
          label="Fecha"
          type="date"
          slotProps={{ htmlInput: { max: today }, inputLabel: { shrink: true } }}
          {...form.field('issuedOn')}
        />
      </Stack>
      <Stack direction="row" spacing={2}>
        <TextField
          label="Total con impuestos"
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          {...form.field('total')}
        />
        <TextField
          label="Moneda"
          select
          slotProps={{ select: { native: true } }}
          {...form.field('currency')}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {CURRENCY_LABELS[currency]}
            </option>
          ))}
        </TextField>
      </Stack>
      <TextField label="Referencia ParLevel (opcional)" {...form.field('parlevelRef')} />
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
      {generalError && !hasFieldError && <ErrorAlert error={generalError} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={pending}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}

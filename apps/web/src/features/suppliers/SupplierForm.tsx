import { CURRENCIES } from '@mimark/contracts/common';
import { CreateSupplierInput, type SupplierDto } from '@mimark/contracts/suppliers';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { CURRENCY_LABELS } from '../../lib/labels';
import { useZodForm } from '../../lib/use-zod-form';

// El alias de ParLevel es opcional: vacío en el formulario = no se envía.
const SupplierFormSchema = CreateSupplierInput.extend({
  active: z.boolean(),
  parlevelName: z.string().trim().max(200, 'Máximo 200 caracteres'),
});
type FormOutput = z.output<typeof SupplierFormSchema>;
export type SupplierFormValues = Omit<FormOutput, 'parlevelName'> & { parlevelName?: string };

interface Props {
  /** Sin `supplier` es un alta; con él, una edición. */
  supplier?: SupplierDto;
  /** Valores iniciales de un alta, p. ej. lo que dice el PDF de ParLevel (spec 015). */
  initial?: { name?: string; parlevelName?: string };
  pending: boolean;
  error: unknown;
  onSubmit: (values: SupplierFormValues) => void;
  onCancel: () => void;
}

/** Formulario puro: no sabe de la API. Lo usa SupplierDialog y lo prueban sin red. */
export function SupplierForm({ supplier, initial, pending, error, onSubmit, onCancel }: Props) {
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const form = useZodForm(
    SupplierFormSchema,
    supplier
      ? {
          ...supplier,
          creditDays: String(supplier.creditDays),
          parlevelName: supplier.parlevelName ?? '',
        }
      : {
          name: initial?.name ?? '',
          taxId: '',
          creditDays: '',
          currency: 'MXN',
          active: true,
          parlevelName: initial?.parlevelName ?? '',
        },
    serverErrors,
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;

  function submit({ parlevelName, ...values }: FormOutput) {
    onSubmit(parlevelName ? { ...values, parlevelName } : values);
  }

  return (
    <Stack component="form" spacing={1} onSubmit={form.handleSubmit(submit)} noValidate>
      <TextField label="Razón social" autoFocus={!initial?.name} {...form.field('name')} />
      <TextField label="RFC" autoFocus={Boolean(initial?.name)} {...form.field('taxId')} />
      <Stack direction="row" spacing={2}>
        <TextField
          label="Días de crédito"
          type="number"
          slotProps={{ htmlInput: { min: 0, max: 365 } }}
          {...form.field('creditDays')}
          helperText={form.errors.creditDays ?? '0 = contado'}
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
      <TextField
        label="Nombre en ParLevel (opcional)"
        {...form.field('parlevelName')}
        helperText={
          form.errors.parlevelName ?? 'Como aparece en «To:» del PDF; sirve para reconocerlo'
        }
      />
      {supplier && (
        <FormControlLabel
          label="Activo"
          control={
            <Switch
              checked={Boolean(form.values.active)}
              onChange={(e) => form.setValue('active', e.target.checked)}
            />
          }
        />
      )}
      {generalError &&
        !generalError.fieldErrors.taxId &&
        !generalError.fieldErrors.parlevelName && <ErrorAlert error={generalError} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={pending}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}

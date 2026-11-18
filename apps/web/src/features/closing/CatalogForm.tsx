import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';

export interface CatalogField {
  name: string;
  label: string;
  type?: 'text' | 'number';
  /** Con opciones el campo es un select nativo. */
  options?: { value: string; label: string }[];
  helper?: string;
}

interface Props<S extends z.ZodType<unknown, Record<string, unknown>>> {
  /** El esquema de contracts que también valida la API. */
  schema: S;
  fields: CatalogField[];
  initial: z.input<S>;
  /** En una edición se ofrece «Activo» para desactivar el registro (nunca se borra). */
  editing?: boolean;
  pending: boolean;
  error: unknown;
  onSubmit: (values: z.output<S>) => void;
  onCancel: () => void;
}

/** Formulario puro de cualquier recurso del catálogo del cierre: no sabe de la API. */
export function CatalogForm<S extends z.ZodType<unknown, Record<string, unknown>>>({
  schema,
  fields,
  initial,
  editing,
  pending,
  error,
  onSubmit,
  onCancel,
}: Props<S>) {
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const form = useZodForm(schema, initial, serverErrors);
  const shown = new Set(fields.map((f) => f.name));
  const generalError =
    error instanceof ApiError &&
    error.code !== 'VALIDATION' &&
    !Object.keys(error.fieldErrors).some((name) => shown.has(name))
      ? error
      : null;

  return (
    <Stack component="form" spacing={1} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {fields.map((f, i) => (
        <TextField
          key={f.name}
          label={f.label}
          type={f.type}
          autoFocus={i === 0}
          select={Boolean(f.options)}
          slotProps={f.options ? { select: { native: true } } : undefined}
          {...form.field(f.name as keyof z.input<S> & string)}
          helperText={form.errors[f.name] ?? f.helper ?? ' '}
        >
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </TextField>
      ))}
      {editing && (
        <FormControlLabel
          label="Activo"
          control={
            <Switch
              checked={Boolean((form.values as Record<string, unknown>).active)}
              onChange={(e) => form.setValue('active', e.target.checked)}
            />
          }
        />
      )}
      {generalError && <ErrorAlert error={generalError} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={pending}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}

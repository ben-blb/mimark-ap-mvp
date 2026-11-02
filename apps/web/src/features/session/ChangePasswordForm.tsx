import { ChangePasswordInput } from '@mimark/contracts/session';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';

const Schema = ChangePasswordInput.extend({ confirm: z.string() }).refine(
  (v) => v.newPassword === v.confirm,
  { message: 'Las contraseñas no coinciden', path: ['confirm'] },
);

/** Formulario puro (sin API): lo usa ChangePasswordPage y lo prueban sin red. */
export function ChangePasswordForm(props: {
  pending: boolean;
  error: unknown;
  onSubmit: (input: ChangePasswordInput) => void;
}) {
  const serverErrors = props.error instanceof ApiError ? props.error.fieldErrors : {};
  const form = useZodForm(
    Schema,
    { currentPassword: '', newPassword: '', confirm: '' },
    serverErrors,
  );
  const submit = form.handleSubmit(({ currentPassword, newPassword }) =>
    props.onSubmit({ currentPassword, newPassword }),
  );

  return (
    <Stack component="form" spacing={2} onSubmit={submit} noValidate>
      <TextField
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        autoFocus
        {...form.field('currentPassword')}
      />
      <TextField
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        {...form.field('newPassword')}
        helperText={form.errors.newPassword ?? 'Al menos 10 caracteres'}
      />
      <TextField
        label="Repite la contraseña nueva"
        type="password"
        autoComplete="new-password"
        {...form.field('confirm')}
      />
      <ErrorAlert
        error={
          props.error instanceof ApiError && props.error.code !== 'VALIDATION' ? props.error : null
        }
      />
      <Button
        type="submit"
        variant="contained"
        size="large"
        loading={props.pending}
        sx={{ py: 1.25 }}
      >
        Guardar contraseña
      </Button>
    </Stack>
  );
}

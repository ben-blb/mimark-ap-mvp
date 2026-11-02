import { ROLES } from '@mimark/contracts/session';
import { CreateUserInput, type UserDto } from '@mimark/contracts/users';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { z } from 'zod';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { ROLE_LABELS } from '../../lib/labels';
import { useZodForm } from '../../lib/use-zod-form';

const FormSchema = CreateUserInput.extend({ active: z.boolean() });
// Al editar, el correo no cambia y no hay contraseña: esos campos no se validan.
const EditSchema = FormSchema.extend({ email: z.string(), password: z.string() });
export type UserFormValues = z.output<typeof FormSchema>;

interface Props {
  /** Sin `user` es un alta; con él, una edición (el correo no cambia). */
  user?: UserDto;
  pending: boolean;
  error: unknown;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
}

/** Formulario puro: no sabe de la API. Lo usa UserDialog y lo prueban sin red. */
export function UserForm({ user, pending, error, onSubmit, onCancel }: Props) {
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const form = useZodForm(
    user ? EditSchema : FormSchema,
    user
      ? { name: user.name, email: user.email, role: user.role, password: '', active: user.active }
      : { name: '', email: '', role: 'purchasing', password: '', active: true },
    serverErrors,
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;

  return (
    <Stack component="form" spacing={1} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <TextField label="Nombre" autoFocus {...form.field('name')} />
      {user ? (
        <TextField label="Correo" value={user.email} disabled helperText=" " />
      ) : (
        <TextField label="Correo" type="email" autoComplete="off" {...form.field('email')} />
      )}
      <TextField
        label="Rol"
        select
        slotProps={{ select: { native: true } }}
        {...form.field('role')}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </TextField>
      {!user && (
        <TextField
          label="Contraseña temporal"
          type="password"
          autoComplete="new-password"
          {...form.field('password')}
          helperText={
            form.errors.password ?? 'Al menos 10 caracteres. La persona la cambia al entrar.'
          }
        />
      )}
      {user && (
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
      {generalError && !generalError.fieldErrors.email && <ErrorAlert error={generalError} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={pending}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}

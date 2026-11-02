import { SetupInput } from '@mimark/contracts/session';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Navigate, useNavigate } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';
import { AuthLayout } from './AuthLayout';
import { useSetup, useSetupStatus } from './session.api';

/** Configuración inicial (spec 013): con el código de quien despliega se crea al primer administrador. */
export function SetupPage() {
  const status = useSetupStatus();
  const setup = useSetup();
  const navigate = useNavigate();
  const serverErrors = setup.error instanceof ApiError ? setup.error.fieldErrors : {};
  const form = useZodForm(
    SetupInput,
    { code: '', name: '', email: '', password: '' },
    serverErrors,
  );

  if (status.isPending) return <LinearProgress />;
  // Con la configuración ya hecha por otra persona se va a /login; la recién creada sigue a `navigate('/')`.
  if (status.data && !status.data.needsSetup && !setup.isSuccess) {
    return <Navigate to="/login" replace />;
  }

  const submit = form.handleSubmit((input) =>
    setup.mutate(input, { onSuccess: () => void navigate('/', { replace: true }) }),
  );

  return (
    <AuthLayout onSubmit={submit} title="Configuración inicial">
      <Typography variant="body2" color="text.secondary">
        Crea al primer administrador. Necesitas el código de configuración que definió quien instaló
        el sistema.
      </Typography>
      <TextField
        label="Código de configuración"
        type="password"
        autoComplete="off"
        {...form.field('code')}
      />
      <TextField label="Tu nombre" autoComplete="name" {...form.field('name')} />
      <TextField label="Correo" type="email" autoComplete="username" {...form.field('email')} />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        {...form.field('password')}
        helperText={form.errors.password ?? 'Al menos 10 caracteres'}
      />
      <ErrorAlert error={setup.error} />
      <Button
        type="submit"
        variant="contained"
        size="large"
        loading={setup.isPending}
        sx={{ py: 1.25 }}
      >
        Crear administrador
      </Button>
    </AuthLayout>
  );
}

import { LoginInput } from '@mimark/contracts/session';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';
import { AuthLayout } from './AuthLayout';
import { useLogin, useSetupStatus } from './session.api';

export function LoginPage() {
  const setup = useSetupStatus();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useZodForm(LoginInput, { email: '', password: '' });

  // Base vacía: no hay a quién autenticar, se crea al primer administrador (AC-013-24).
  if (setup.data?.needsSetup) return <Navigate to="/configuracion-inicial" replace />;

  const submit = form.handleSubmit((input) =>
    login.mutate(input, {
      onSuccess: () => {
        const from = (location.state as { from?: string } | null)?.from;
        void navigate(from ?? '/', { replace: true });
      },
    }),
  );
  const fieldErrors = login.error instanceof ApiError ? login.error.fieldErrors : {};

  return (
    <AuthLayout onSubmit={submit}>
      {setup.isPending && <LinearProgress />}
      <TextField
        label="Correo"
        type="email"
        autoComplete="username"
        autoFocus
        {...form.field('email')}
        helperText={form.errors.email ?? fieldErrors.email ?? ' '}
      />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        {...form.field('password')}
      />
      <ErrorAlert error={login.error} />
      <Button
        type="submit"
        variant="contained"
        size="large"
        loading={login.isPending}
        sx={{ py: 1.25 }}
      >
        Entrar
      </Button>
    </AuthLayout>
  );
}

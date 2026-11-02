import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { AuthLayout } from './AuthLayout';
import { ChangePasswordForm } from './ChangePasswordForm';
import { useChangePassword, useLogout } from './session.api';

/** Pantalla única mientras la persona debe cambiar su contraseña (AC-013-11, AC-013-24). */
export function ChangePasswordPage() {
  const change = useChangePassword();
  const logout = useLogout();
  return (
    <AuthLayout title="Cambia tu contraseña">
      <Typography variant="body2" color="text.secondary">
        Tu contraseña es temporal. Elige una nueva para continuar.
      </Typography>
      <ChangePasswordForm
        pending={change.isPending}
        error={change.error}
        onSubmit={(input) => change.mutate(input)}
      />
      <Button color="inherit" onClick={() => logout.mutate()}>
        Salir
      </Button>
    </AuthLayout>
  );
}

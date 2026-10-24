import { LoginInput, ROLES } from '@mimark/contracts/session';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useLocation, useNavigate } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ROLE_LABELS } from '../../lib/labels';
import { useZodForm } from '../../lib/use-zod-form';
import { useLogin } from './session.api';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useZodForm(LoginInput, { code: '', name: '', role: 'payables' });

  const submit = form.handleSubmit((input) =>
    login.mutate(input, {
      onSuccess: () => {
        const from = (location.state as { from?: string } | null)?.from;
        void navigate(from ?? '/', { replace: true });
      },
    }),
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper
        component="form"
        onSubmit={submit}
        noValidate
        sx={{ p: 4, width: '100%', maxWidth: 400 }}
      >
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            MIMARK
          </Typography>
          <Typography variant="h1">Cuentas por pagar</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pb: 2 }}>
            Entra con el código de acceso que te compartieron.
          </Typography>
          <TextField
            label="Código de acceso"
            type="password"
            autoComplete="current-password"
            {...form.field('code')}
          />
          <TextField label="Tu nombre" autoComplete="name" {...form.field('name')} />
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
          <ErrorAlert error={login.error} />
          <Button type="submit" variant="contained" size="large" loading={login.isPending}>
            Entrar
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

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
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper
        component="form"
        onSubmit={submit}
        noValidate
        sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 380 }}
      >
        <Stack spacing={2}>
          <Box sx={{ pb: 1 }}>
            <Typography sx={{ fontWeight: 600, letterSpacing: '0.04em' }}>MIMARK</Typography>
            <Typography variant="h1" component="p" sx={{ color: 'text.tertiary', fontWeight: 400 }}>
              Cuentas por pagar
            </Typography>
          </Box>
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
          <Button
            type="submit"
            variant="contained"
            size="large"
            loading={login.isPending}
            sx={{ py: 1.25 }}
          >
            Entrar
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

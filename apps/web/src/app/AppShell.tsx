import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router';
import { useLogout, useSession } from '../features/session/session.api';
import { ROLE_LABELS } from '../lib/labels';

/** Navegación principal. Cada spec que agrega una pantalla de primer nivel la suma aquí. */
const NAV_ITEMS = [
  { to: '/proveedores', label: 'Proveedores' },
  { to: '/ordenes', label: 'Órdenes de compra' },
] as const;

export function AppShell() {
  const session = useSession();
  const logout = useLogout();

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 3, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700 }}>MIMARK · Cuentas por pagar</Typography>
          <Stack direction="row" spacing={0.5} component="nav" sx={{ flexGrow: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                color="inherit"
                sx={{ '&.active': { color: 'primary.main', bgcolor: 'action.selected' } }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          {session.data && (
            <Typography variant="body2" color="text.secondary">
              {session.data.actor} · {ROLE_LABELS[session.data.role]}
            </Typography>
          )}
          <Button variant="outlined" size="small" onClick={() => logout.mutate()}>
            Salir
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

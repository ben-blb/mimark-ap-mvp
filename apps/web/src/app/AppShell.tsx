import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { BrandMark } from '../components/BrandMark';
import { useLogout, useSession } from '../features/session/session.api';
import { ROLE_LABELS } from '../lib/labels';
import { surface, MOBILE_NAV_OFFSET, vars } from './theme';

/** Navegación principal. Cada spec que agrega una pantalla de primer nivel la suma aquí. */
const NAV_ITEMS = [
  { to: '/', label: 'Tablero', short: 'Tablero', icon: <SpaceDashboardOutlined /> },
  { to: '/proveedores', label: 'Proveedores', short: 'Proveedores', icon: <StorefrontOutlined /> },
  { to: '/ordenes', label: 'Órdenes de compra', short: 'Órdenes', icon: <ReceiptLongOutlined /> },
  { to: '/expedientes', label: 'Expedientes', short: 'Expedientes', icon: <DescriptionOutlined /> },
  { to: '/asistente', label: 'Asistente', short: 'Asistente', icon: <AutoAwesomeOutlined /> },
] as const;

const SIDEBAR_WIDTH = 248;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function Wordmark() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <BrandMark size={30} />
      <Box sx={{ lineHeight: 1.1 }}>
        <Typography sx={{ fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          MIMARK
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
          Cuentas por pagar
        </Typography>
      </Box>
    </Stack>
  );
}

/** Barra lateral de escritorio (AC-009-02). */
function Sidebar(props: { actor?: string; role?: string; onLogout: () => void }) {
  return (
    <Box
      component="aside"
      sx={(theme) => ({
        ...surface(theme),
        position: 'fixed',
        top: 12,
        bottom: 12,
        left: 12,
        width: SIDEBAR_WIDTH,
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        zIndex: theme.zIndex.appBar,
      })}
    >
      <Box sx={{ px: 1, pt: 0.5, pb: 3 }}>
        <Wordmark />
      </Box>
      <Stack component="nav" aria-label="Principal" spacing={0.5} sx={{ flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => (
          <Box
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: '10px',
              color: 'text.primary',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.9375rem',
              transition: 'background-color 150ms ease',
              '& svg': { fontSize: 20, color: 'text.secondary' },
              '&:hover': { bgcolor: 'rgba(118 118 128 / 0.12)' },
              '&:focus-visible': {
                outline: `2px solid ${vars(theme).palette.primary.main}`,
                outlineOffset: 1,
              },
              '&.active': {
                bgcolor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.12)`,
                color: 'primary.main',
                fontWeight: 600,
                '& svg': { color: 'primary.main' },
              },
            })}
          >
            {item.icon}
            {item.label}
          </Box>
        ))}
      </Stack>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}
      >
        <Avatar sx={{ width: 34, height: 34, fontSize: 14, bgcolor: 'primary.main' }}>
          {initials(props.actor ?? '')}
        </Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {props.actor}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {props.role}
          </Typography>
        </Box>
        <IconButton aria-label="Salir" title="Salir" size="small" onClick={props.onLogout}>
          <LogoutOutlined fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}

/** Barra superior compacta y barra inferior del teléfono (AC-009-02). */
function MobileChrome(props: { actor?: string; role?: string; onLogout: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Box
        component="header"
        sx={(theme) => ({
          ...surface(theme),
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar,
          border: 0,
          borderBottom: 1,
          borderColor: 'divider',
          borderRadius: 0,
          boxShadow: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          pt: 'calc(8px + env(safe-area-inset-top))',
        })}
      >
        <Wordmark />
        <IconButton
          aria-label="Cuenta"
          aria-haspopup="menu"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ p: 0.5 }}
        >
          <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>
            {initials(props.actor ?? '')}
          </Avatar>
        </IconButton>
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: 1.4, py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {props.actor}
            </Typography>
            <Typography variant="caption">{props.role}</Typography>
          </ListSubheader>
          <MenuItem onClick={props.onLogout}>
            <LogoutOutlined fontSize="small" sx={{ mr: 1.5 }} />
            Salir
          </MenuItem>
        </Menu>
      </Box>

      <Box
        component="nav"
        aria-label="Principal"
        sx={(theme) => ({
          ...surface(theme),
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.appBar,
          border: 0,
          borderTop: 1,
          borderColor: 'divider',
          borderRadius: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`,
          height: MOBILE_NAV_OFFSET,
          pb: 'env(safe-area-inset-bottom)',
        })}
      >
        {NAV_ITEMS.map((item) => (
          <Box
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            aria-label={item.label}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              color: 'text.secondary',
              textDecoration: 'none',
              fontSize: '0.6875rem',
              fontWeight: 500,
              minWidth: 0,
              '& svg': { fontSize: 24 },
              '&.active': { color: 'primary.main', fontWeight: 600 },
              '&:active svg': { transform: 'scale(0.9)' },
            }}
          >
            {item.icon}
            <Box
              component="span"
              sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {item.short}
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

export function AppShell() {
  const session = useSession();
  const logout = useLogout();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const user = {
    actor: session.data?.actor,
    role: session.data ? ROLE_LABELS[session.data.role] : undefined,
    onLogout: () => logout.mutate(),
  };

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      {desktop ? <Sidebar {...user} /> : <MobileChrome {...user} />}
      <Box
        component="main"
        sx={{
          ml: { md: `${SIDEBAR_WIDTH + 24}px` },
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 2.5, md: 5 },
          pb: { xs: `calc(${MOBILE_NAV_OFFSET} + 24px)`, md: 6 },
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

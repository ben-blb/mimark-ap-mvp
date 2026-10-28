import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { MOBILE_NAV_OFFSET, vars } from './theme';

/** Navegación principal. Cada spec que agrega una pantalla de primer nivel la suma aquí. */
const NAV_ITEMS = [
  {
    to: '/',
    tour: 'tablero',
    label: 'Tablero',
    short: 'Tablero',
    icon: <SpaceDashboardOutlined />,
  },
  {
    to: '/proveedores',
    tour: 'proveedores',
    label: 'Proveedores',
    short: 'Proveedores',
    icon: <StorefrontOutlined />,
  },
  {
    to: '/ordenes',
    tour: 'ordenes',
    label: 'Órdenes de compra',
    short: 'Órdenes',
    icon: <ReceiptLongOutlined />,
  },
  {
    to: '/expedientes',
    tour: 'expedientes',
    label: 'Expedientes',
    short: 'Expedientes',
    icon: <DescriptionOutlined />,
  },
  {
    to: '/asistente',
    tour: 'asistente',
    label: 'Asistente',
    short: 'Asistente',
    icon: <AutoAwesomeOutlined />,
  },
] as const;

export const SIDEBAR_WIDTH = 220;

export interface UserProps {
  actor?: string;
  role?: string;
  onLogout: () => void;
  onTour: () => void;
}

/** Marca en texto: sin logotipo (DESIGN.md). */
function Wordmark() {
  return (
    <Box>
      <Typography sx={{ fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1.3 }}>
        MIMARK
      </Typography>
      <Typography variant="caption" component="div" sx={{ color: 'text.tertiary' }}>
        Cuentas por pagar
      </Typography>
    </Box>
  );
}

/** Barra lateral de escritorio pegada al borde (AC-010-02). */
export function Sidebar(props: UserProps) {
  return (
    <Box
      component="aside"
      sx={(theme) => ({
        position: 'fixed',
        inset: '0 auto 0 0',
        width: SIDEBAR_WIDTH,
        borderRight: `1px solid ${vars(theme).palette.divider}`,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        py: 3,
        zIndex: theme.zIndex.appBar,
      })}
    >
      <Box sx={{ px: 3, pb: 4 }}>
        <Wordmark />
      </Box>
      <Stack component="nav" aria-label="Principal" sx={{ flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => (
          <Box
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            data-tour={item.tour}
            sx={(theme) => ({
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              px: 3,
              height: 36,
              color: 'text.secondary',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'color 120ms ease',
              '&:hover': { color: 'text.primary' },
              '&:focus-visible': { outlineOffset: -2 },
              '&.active': {
                color: 'primary.main',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  bgcolor: vars(theme).palette.primary.main,
                },
              },
            })}
          >
            {item.label}
          </Box>
        ))}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
            {props.actor}
          </Typography>
          <Typography variant="caption" noWrap component="div" sx={{ color: 'text.tertiary' }}>
            {props.role}
          </Typography>
        </Box>
        <IconButton
          aria-label="Ver tutorial"
          title="Ver tutorial"
          size="small"
          data-tour="ayuda"
          onClick={props.onTour}
        >
          <HelpOutlineOutlined fontSize="small" />
        </IconButton>
        <IconButton aria-label="Salir" title="Salir" size="small" onClick={props.onLogout}>
          <LogoutOutlined fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}

/** Barra superior compacta y barra inferior del teléfono (AC-009-02). */
export function MobileChrome(props: UserProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Box
        component="header"
        sx={(theme) => ({
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar,
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          pt: 'calc(8px + env(safe-area-inset-top))',
        })}
      >
        <Wordmark />
        <Box
          component="button"
          type="button"
          aria-label="Cuenta"
          aria-haspopup="menu"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            all: 'unset',
            cursor: 'pointer',
            maxWidth: '50%',
            fontSize: '0.8125rem',
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {props.actor}
        </Box>
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: 1.4, py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
              {props.actor}
            </Typography>
            <Typography variant="caption">{props.role}</Typography>
          </ListSubheader>
          <MenuItem
            onClick={() => {
              setAnchor(null);
              props.onTour();
            }}
          >
            <HelpOutlineOutlined fontSize="small" sx={{ mr: 1.5 }} />
            Ver tutorial
          </MenuItem>
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
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.appBar,
          bgcolor: 'background.default',
          borderTop: 1,
          borderColor: 'divider',
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
            data-tour={item.tour}
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
              '& svg': { fontSize: 20 },
              '&.active': { color: 'primary.main' },
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

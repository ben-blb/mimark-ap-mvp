import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useSession } from '../features/session/session.api';
import { Tour } from '../features/tour/Tour';
import { hasSeenTour, markTourSeen } from '../features/tour/tour.storage';
import { ROLE_LABELS } from '../lib/labels';
import { MobileChrome, SIDEBAR_WIDTH, Sidebar } from './AppNav';
import { MOBILE_NAV_OFFSET } from './theme';

/** Estado de navegación con el que `⌘K` pide al asistente enfocar su compositor (AC-010-08). */
export interface FocusComposerState {
  focusComposer: number;
}

/** `⌘K` / `Ctrl+K` desde cualquier pantalla: abre el asistente con el compositor enfocado (AC-010-08). */
function useComposerShortcut() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      const state: FocusComposerState = { focusComposer: Date.now() };
      // Dentro de una conversación guardada se queda en ella (spec 011).
      void navigate(pathname.startsWith('/asistente') ? pathname : '/asistente', { state });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, pathname]);
}

export function AppShell() {
  const session = useSession();
  const logout = useLogout();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  useComposerShortcut();
  const actor = session.data?.actor;
  // Se abre solo la primera vez de esta persona en este navegador, o cuando ella lo pide (spec 012).
  const [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const seen = useMemo(() => !actor || hasSeenTour(actor), [actor]);
  const tourOpen = requested || (!seen && !dismissed);
  const user = {
    actor,
    role: session.data ? ROLE_LABELS[session.data.role] : undefined,
    onLogout: () => logout.mutate(),
    onTour: () => setRequested(true),
  };

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      {tourOpen && (
        <Tour
          onClose={() => {
            if (actor) markTourSeen(actor);
            setRequested(false);
            setDismissed(true);
          }}
        />
      )}
      {desktop ? <Sidebar {...user} /> : <MobileChrome {...user} />}
      <Box
        component="main"
        sx={{
          ml: { md: `${SIDEBAR_WIDTH}px` },
          px: { xs: 2, sm: 3, md: 5 },
          pt: { xs: 2.5, md: 4 },
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

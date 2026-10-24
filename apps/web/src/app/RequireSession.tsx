import LinearProgress from '@mui/material/LinearProgress';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErrorAlert } from '../components/ErrorAlert';
import { useSession } from '../features/session/session.api';

/** Todo lo que está adentro exige sesión; si no hay, manda a /login y regresa al terminar. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LinearProgress />;
  if (session.isError) return <ErrorAlert error={session.error} />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

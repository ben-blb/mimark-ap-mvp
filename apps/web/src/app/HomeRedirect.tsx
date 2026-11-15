import { Navigate } from 'react-router';
import { MyWorkPage } from '../features/home/MyWorkPage';
import { useCan } from '../features/session/session.api';

/** Inicio por rol (AC-017-09): «Mi trabajo», o la pantalla de su función si no tiene bandeja. */
export function HomeRedirect() {
  const can = useCan();
  if (can('inbox:read')) return <MyWorkPage />;
  if (can('orders:receive')) return <Navigate to="/recepciones" replace />;
  if (can('dashboard:read')) return <Navigate to="/tablero" replace />;
  return <Navigate to="/ordenes" replace />;
}

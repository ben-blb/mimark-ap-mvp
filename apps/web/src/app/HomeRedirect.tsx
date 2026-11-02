import { Navigate } from 'react-router';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { useCan } from '../features/session/session.api';

/** El tablero es la portada; quien no ve cartera (almacén) entra directo a las órdenes. */
export function HomeRedirect() {
  const can = useCan();
  return can('dashboard:read') ? <DashboardPage /> : <Navigate to="/ordenes" replace />;
}

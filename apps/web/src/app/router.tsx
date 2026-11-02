import Typography from '@mui/material/Typography';
import { createBrowserRouter } from 'react-router';
import { AssistantRoute } from '../features/assistant/AssistantRoute';
import { LoginPage } from '../features/session/LoginPage';
import { SetupPage } from '../features/session/SetupPage';
import { UsersPage } from '../features/users/UsersPage';
import { PayableDetailPage } from '../features/payables/PayableDetailPage';
import { PayablesPage } from '../features/payables/PayablesPage';
import { PurchaseOrdersPage } from '../features/purchase-orders/PurchaseOrdersPage';
import { SuppliersPage } from '../features/suppliers/SuppliersPage';
import { AppShell } from './AppShell';
import { HomeRedirect } from './HomeRedirect';
import { RequirePermission } from './RequirePermission';
import { RequireSession } from './RequireSession';

/** Todas las pantallas en un solo lugar. Cada spec agrega aquí su ruta. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/configuracion-inicial', element: <SetupPage /> },
  {
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'proveedores', element: <SuppliersPage /> },
      { path: 'ordenes', element: <PurchaseOrdersPage /> },
      {
        path: 'expedientes',
        element: (
          <RequirePermission permission="payables:read">
            <PayablesPage />
          </RequirePermission>
        ),
      },
      {
        path: 'expedientes/:id',
        element: (
          <RequirePermission permission="payables:read">
            <PayableDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'asistente/:id?',
        element: (
          <RequirePermission permission="assistant:use">
            <AssistantRoute />
          </RequirePermission>
        ),
      },
      {
        path: 'usuarios',
        element: (
          <RequirePermission permission="users:manage">
            <UsersPage />
          </RequirePermission>
        ),
      },
      { path: '*', element: <Typography>No existe esta página.</Typography> },
    ],
  },
]);

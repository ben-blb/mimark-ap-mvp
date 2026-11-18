import Typography from '@mui/material/Typography';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AssistantRoute } from '../features/assistant/AssistantRoute';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ReceiptsPage } from '../features/receipts/ReceiptsPage';
import { LoginPage } from '../features/session/LoginPage';
import { SetupPage } from '../features/session/SetupPage';
import { UsersPage } from '../features/users/UsersPage';
import { PayableDetailPage } from '../features/payables/PayableDetailPage';
import { PayablesPage } from '../features/payables/PayablesPage';
import { PurchaseOrderDetailPage } from '../features/purchase-orders/PurchaseOrderDetailPage';
import { PurchaseOrdersPage } from '../features/purchase-orders/PurchaseOrdersPage';
import { CatalogPage } from '../features/closing/CatalogPage';
import { SuppliersPage } from '../features/suppliers/SuppliersPage';
import { AppShell } from './AppShell';
import { HomeRedirect } from './HomeRedirect';
import { RequirePermission } from './RequirePermission';
import { RequireSession } from './RequireSession';

/** Todas las pantallas en un solo lugar. Cada spec agrega aquí su ruta. */
export const routes: RouteObject[] = [
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
      {
        path: 'proveedores',
        element: (
          <RequirePermission permission="suppliers:read">
            <SuppliersPage />
          </RequirePermission>
        ),
      },
      {
        path: 'ordenes',
        element: (
          <RequirePermission permission="orders:read">
            <PurchaseOrdersPage />
          </RequirePermission>
        ),
      },
      {
        path: 'ordenes/:id',
        element: (
          <RequirePermission permission="orders:read">
            <PurchaseOrderDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'recepciones',
        element: (
          <RequirePermission permission="orders:receive">
            <ReceiptsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'tablero',
        element: (
          <RequirePermission permission="dashboard:read">
            <DashboardPage />
          </RequirePermission>
        ),
      },
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
        path: 'cierre/catalogo',
        element: (
          <RequirePermission permission="reports:read">
            <CatalogPage />
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
];

export const router = createBrowserRouter(routes);

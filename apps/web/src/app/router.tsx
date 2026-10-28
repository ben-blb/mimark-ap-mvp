import Typography from '@mui/material/Typography';
import { createBrowserRouter } from 'react-router';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { LoginPage } from '../features/session/LoginPage';
import { PayableDetailPage } from '../features/payables/PayableDetailPage';
import { PayablesPage } from '../features/payables/PayablesPage';
import { PurchaseOrdersPage } from '../features/purchase-orders/PurchaseOrdersPage';
import { SuppliersPage } from '../features/suppliers/SuppliersPage';
import { AppShell } from './AppShell';
import { RequireSession } from './RequireSession';

/** Todas las pantallas en un solo lugar. Cada spec agrega aquí su ruta. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'proveedores', element: <SuppliersPage /> },
      { path: 'ordenes', element: <PurchaseOrdersPage /> },
      { path: 'expedientes', element: <PayablesPage /> },
      { path: 'expedientes/:id', element: <PayableDetailPage /> },
      { path: 'asistente', element: <AssistantPage /> },
      { path: '*', element: <Typography>No existe esta página.</Typography> },
    ],
  },
]);

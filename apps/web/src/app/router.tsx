import Typography from '@mui/material/Typography';
import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from '../features/session/LoginPage';
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
      // La spec 006 reemplaza esta redirección por el tablero.
      { index: true, element: <Navigate to="/proveedores" replace /> },
      { path: 'proveedores', element: <SuppliersPage /> },
      { path: '*', element: <Typography>No existe esta página.</Typography> },
    ],
  },
]);

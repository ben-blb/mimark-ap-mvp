import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import PeopleOutlineOutlined from '@mui/icons-material/PeopleOutlineOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import type { Permission } from '@mimark/contracts/permissions';
import type { ReactElement } from 'react';

export interface NavItem {
  to: string;
  tour: string;
  /** Sin `permission`, la sección es para cualquier sesión. */
  permission?: Permission;
  label: string;
  short: string;
  icon: ReactElement;
}

/** Navegación principal. Cada spec que agrega una pantalla de primer nivel la suma aquí. */
const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    tour: 'tablero',
    permission: 'dashboard:read',
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
    permission: 'payables:read',
    label: 'Expedientes',
    short: 'Expedientes',
    icon: <DescriptionOutlined />,
  },
  {
    to: '/asistente',
    tour: 'asistente',
    permission: 'assistant:use',
    label: 'Asistente',
    short: 'Asistente',
    icon: <AutoAwesomeOutlined />,
  },
  {
    to: '/usuarios',
    tour: 'usuarios',
    permission: 'users:manage',
    label: 'Usuarios',
    short: 'Usuarios',
    icon: <PeopleOutlineOutlined />,
  },
];

/** Las secciones que el rol puede abrir (spec 013). Las que no tienen `permission` son para cualquier sesión. */
export function navItemsFor(can: (permission: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
}

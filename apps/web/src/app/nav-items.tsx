import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import PeopleOutlineOutlined from '@mui/icons-material/PeopleOutlineOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import type { Permission } from '@mimark/contracts/permissions';
import type { ReactElement } from 'react';

export interface NavItem {
  to: string;
  tour: string;
  permission: Permission;
  label: string;
  short: string;
  icon: ReactElement;
}

/** Navegación principal, en el orden de la spec 017 (AC-017-07). Cada pantalla de primer nivel la suma aquí. */
const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    tour: 'mi-trabajo',
    permission: 'inbox:read',
    label: 'Mi trabajo',
    short: 'Mi trabajo',
    icon: <InboxOutlined />,
  },
  {
    to: '/recepciones',
    tour: 'recepciones',
    permission: 'orders:receive',
    label: 'Recepciones',
    short: 'Recepciones',
    icon: <LocalShippingOutlined />,
  },
  {
    to: '/ordenes',
    tour: 'ordenes',
    permission: 'orders:read',
    label: 'Órdenes de compra',
    short: 'Órdenes',
    icon: <ReceiptLongOutlined />,
  },
  {
    to: '/expedientes',
    tour: 'expedientes',
    permission: 'payables:read',
    label: 'Facturas y pagos',
    short: 'Facturas',
    icon: <DescriptionOutlined />,
  },
  {
    to: '/proveedores',
    tour: 'proveedores',
    permission: 'suppliers:read',
    label: 'Proveedores',
    short: 'Proveedores',
    icon: <StorefrontOutlined />,
  },
  {
    to: '/tablero',
    tour: 'tablero',
    permission: 'dashboard:read',
    label: 'Tablero',
    short: 'Tablero',
    icon: <SpaceDashboardOutlined />,
  },
  {
    to: '/cierre/catalogo',
    tour: 'cierre',
    permission: 'reports:read',
    label: 'Cierre',
    short: 'Cierre',
    icon: <EventNoteOutlined />,
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

/** Las secciones que el rol puede abrir (specs 013 y 017). */
export function navItemsFor(can: (permission: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => can(item.permission));
}

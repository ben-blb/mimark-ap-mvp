import type { Permission } from '@mimark/contracts/permissions';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useCan } from '../features/session/session.api';

/** Pantalla que exige un permiso: si el rol no lo tiene, lo dice en vez de mostrar errores 403. */
export function RequirePermission(props: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  if (!can(props.permission)) {
    return <Typography>Tu rol no tiene acceso a esta página.</Typography>;
  }
  return props.children;
}

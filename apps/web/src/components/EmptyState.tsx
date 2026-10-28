import InboxOutlined from '@mui/icons-material/InboxOutlined';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Lista sin resultados: icono, el mensaje y, si aplica, la acción para salir de ahí. */
export function EmptyState(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ py: 5, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <InboxOutlined aria-hidden sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
        {props.children}
      </Typography>
      {props.action}
    </Stack>
  );
}

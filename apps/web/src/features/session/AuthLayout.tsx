import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FormEventHandler, ReactNode } from 'react';
import { DbWakeNotice } from './DbWakeNotice';

/** Tarjeta centrada con la marca, común a entrar, configuración inicial y cambio de contraseña. */
export function AuthLayout(props: {
  /** Sin `onSubmit` la tarjeta no es un formulario (el contenido trae el suyo). */
  onSubmit?: FormEventHandler;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper
        component={props.onSubmit ? 'form' : 'div'}
        onSubmit={props.onSubmit}
        noValidate
        sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 380 }}
      >
        <Stack spacing={2}>
          <Box sx={{ pb: 1 }}>
            <Typography sx={{ fontWeight: 600, letterSpacing: '0.04em' }}>MIMARK</Typography>
            <Typography variant="h1" component="p" sx={{ color: 'text.tertiary', fontWeight: 400 }}>
              {props.title ?? 'Cuentas por pagar'}
            </Typography>
          </Box>
          <DbWakeNotice />
          {props.children}
        </Stack>
      </Paper>
    </Box>
  );
}

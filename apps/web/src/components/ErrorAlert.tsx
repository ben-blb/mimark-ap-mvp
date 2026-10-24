import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { ApiError } from '../lib/api-client';

/** Error para el usuario: mensaje claro y la referencia para buscarlo en los logs. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  const ref = error instanceof ApiError ? error.requestId : undefined;
  return (
    <Alert severity="error" role="alert">
      {message}
      {ref && (
        <Box
          component="span"
          sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', fontSize: 12 }}
        >
          Ref. {ref}
        </Box>
      )}
    </Alert>
  );
}

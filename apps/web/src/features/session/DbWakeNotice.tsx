import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import { useEffect, useState } from 'react';
import { useDbHealth } from './health.api';

/** Pasado este tiempo sin respuesta se avisa que la base está despertando. */
const SLOW_AFTER_MS = 2_000;

/** Aviso de las pantallas de acceso mientras Neon despierta (spec 016). No bloquea el formulario. */
export function DbWakeNotice() {
  const health = useDbHealth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!health.isPending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [health.isPending]);

  const awake = health.data?.db === 'ok';
  const failed = health.isError || health.data?.db === 'error';
  if (awake || !(failed || slow)) return null;

  return (
    <Alert severity="info" role="status">
      <Stack spacing={1}>
        <span>Despertando la base de datos… Puede tardar unos segundos.</span>
        <LinearProgress aria-hidden />
      </Stack>
    </Alert>
  );
}

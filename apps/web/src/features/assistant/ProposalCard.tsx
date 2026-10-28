import type { AssistantToolCall } from '@mimark/contracts/assistant';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ASSISTANT_TOOL_LABELS } from '../../lib/labels';

export type ProposalStatus = 'pending' | 'running' | 'confirmed' | 'cancelled' | 'failed';

const STATUS_TEXT: Record<Exclude<ProposalStatus, 'pending'>, string> = {
  running: 'Ejecutando…',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  failed: 'Falló',
};

/** Una escritura propuesta por el asistente. Nada se ejecuta hasta que la persona confirma. Puro, sin API. */
export function ProposalCard(props: {
  call: AssistantToolCall;
  status: ProposalStatus;
  error?: string;
  /** Texto que explica por qué no se puede confirmar todavía (p. ej. falta el adjunto). */
  blockedReason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { call, status } = props;
  const fields = Object.entries((call.input ?? {}) as Record<string, unknown>);
  const pending = status === 'pending';

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2 }}
      aria-label={`Propuesta: ${ASSISTANT_TOOL_LABELS[call.name]}`}
    >
      <Typography variant="overline" color="text.secondary">
        Propuesta del asistente
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{ASSISTANT_TOOL_LABELS[call.name]}</Typography>
      {fields.length > 0 && (
        <Box component="dl" sx={{ m: 0, mt: 1 }}>
          {fields.map(([key, value]) => (
            <Typography key={key} variant="body2" component="div">
              <Box component="dt" sx={{ display: 'inline', color: 'text.secondary' }}>
                {key}:
              </Box>{' '}
              <Box component="dd" sx={{ display: 'inline', m: 0 }}>
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </Box>
            </Typography>
          ))}
        </Box>
      )}
      {pending && props.blockedReason && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {props.blockedReason}
        </Alert>
      )}
      {props.error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {props.error}
        </Alert>
      )}
      {pending ? (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={props.onConfirm} disabled={!!props.blockedReason}>
            Confirmar
          </Button>
          <Button onClick={props.onCancel}>Cancelar</Button>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {STATUS_TEXT[status]}
        </Typography>
      )}
    </Paper>
  );
}

import type { AssistantToolCall } from '@mimark/contracts/assistant';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import { MONO } from '../../app/theme';
import { ASSISTANT_TOOL_LABELS, ASSISTANT_TOOL_PROGRESS } from '../../lib/labels';

export interface ToolRun {
  status: 'running' | 'done' | 'failed';
  ms?: number;
  value?: unknown;
  error?: string;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function StatusMark({ run }: { run: ToolRun }) {
  if (run.status === 'running') {
    return <CircularProgress size={12} thickness={5} aria-label="En curso" />;
  }
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 12,
        textAlign: 'center',
        color: run.status === 'done' ? 'success.main' : 'error.main',
      }}
    >
      {run.status === 'done' ? '✓' : '✕'}
    </Box>
  );
}

/**
 * Una lectura del asistente como fila de estado (AC-010-07): corriendo, ✓ con su tiempo o ✕ con su error. Se
 * expande para ver parámetros y resultado crudo, siempre como texto.
 */
export function ToolCallRow(props: { call: AssistantToolCall; run: ToolRun }) {
  const { call, run } = props;
  const [open, setOpen] = useState(false);
  const panel = useId();
  const label = ASSISTANT_TOOL_PROGRESS[call.name] ?? ASSISTANT_TOOL_LABELS[call.name];

  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 28,
          fontSize: '0.8125rem',
          color: 'text.secondary',
          transition: 'color 120ms ease',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <StatusMark run={run} />
        <Box component="span" sx={{ flexGrow: 1 }}>
          {run.status === 'running' ? `${label}…` : label}
          {run.status === 'failed' && run.error && (
            <Box component="span" sx={{ color: 'error.main' }}>
              {' · '}
              {run.error}
            </Box>
          )}
        </Box>
        {run.ms !== undefined && (
          <Box component="span" sx={{ color: 'text.tertiary', fontVariantNumeric: 'tabular-nums' }}>
            {run.ms} ms
          </Box>
        )}
        <Box component="span" aria-hidden sx={{ color: 'text.tertiary', width: 12 }}>
          {open ? '−' : '+'}
        </Box>
      </Box>
      <Collapse in={open} id={panel} unmountOnExit>
        <Stack spacing={1} sx={{ pl: 2.5, pb: 1 }}>
          <RawBlock title="Parámetros" text={pretty(call.input ?? {})} />
          {run.status !== 'running' && (
            <RawBlock title="Resultado" text={pretty(run.value ?? { error: run.error })} />
          )}
        </Stack>
      </Collapse>
    </Box>
  );
}

function RawBlock(props: { title: string; text: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.tertiary' }}>
        {props.title}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          maxHeight: 240,
          overflow: 'auto',
          fontFamily: MONO,
          fontSize: '0.75rem',
          bgcolor: 'background.surface1',
          border: 1,
          borderColor: 'divider',
          borderRadius: '6px',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {props.text}
      </Box>
    </Box>
  );
}

/** Varias lecturas seguidas se agrupan en un solo bloque. */
export function ToolCallGroup(props: {
  calls: AssistantToolCall[];
  runs: Record<string, ToolRun | undefined>;
}) {
  return (
    <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 1.5, py: 0.25 }}>
      {props.calls.map((call) => (
        <ToolCallRow key={call.id} call={call} run={props.runs[call.id] ?? { status: 'running' }} />
      ))}
    </Box>
  );
}

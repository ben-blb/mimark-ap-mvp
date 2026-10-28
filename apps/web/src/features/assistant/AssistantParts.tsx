import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { FormEvent } from 'react';
import { glass, MOBILE_NAV_OFFSET, tonal } from '../../app/theme';

const EXAMPLES = [
  '¿Qué vence en los próximos 7 días?',
  '¿Cuántos expedientes están en revisión?',
  'Programa la factura F-120 para el viernes',
];

/** Conversación vacía: ejemplos que rellenan el mensaje (no lo envían). */
export function EmptyChat(props: { onPick: (text: string) => void }) {
  return (
    <Paper sx={{ p: { xs: 2.5, sm: 4 }, textAlign: 'center' }}>
      <Box
        aria-hidden
        sx={(theme) => ({
          ...tonal(theme, 'primary'),
          width: 48,
          height: 48,
          mx: 'auto',
          mb: 1.5,
          borderRadius: '14px',
          display: 'grid',
          placeItems: 'center',
        })}
      >
        <AutoAwesomeOutlined />
      </Box>
      <Typography variant="h2" sx={{ mb: 0.5 }}>
        ¿En qué te ayudo?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Prueba con uno de estos ejemplos:
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
        {EXAMPLES.map((example) => (
          <Chip
            key={example}
            label={example}
            variant="outlined"
            onClick={() => props.onPick(example)}
            sx={{ height: 'auto', py: 0.75, '& .MuiChip-label': { whiteSpace: 'normal' } }}
          />
        ))}
      </Stack>
    </Paper>
  );
}

/** "Pensando…" con tres puntos; sin animación si la persona pide movimiento reducido (tema). */
export function TypingIndicator() {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 1 }}>
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          gap: 0.5,
          '& span': {
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            animation: 'mimark-typing 1.2s infinite ease-in-out',
          },
          '& span:nth-of-type(2)': { animationDelay: '0.15s' },
          '& span:nth-of-type(3)': { animationDelay: '0.3s' },
          '@keyframes mimark-typing': {
            '0%, 80%, 100%': { opacity: 0.3 },
            '40%': { opacity: 1 },
          },
        }}
      >
        <span />
        <span />
        <span />
      </Box>
      <Typography variant="body2" color="text.secondary">
        Pensando…
      </Typography>
    </Stack>
  );
}

/** Compositor fijo al pie: adjuntar, escribir (Enter envía, Mayús+Enter nueva línea) y enviar. */
export function Composer(props: {
  draft: string;
  onDraftChange: (text: string) => void;
  file: File | null;
  fileError: string | null;
  busy: boolean;
  locked: boolean;
  waiting: boolean;
  onSubmit: (event: FormEvent) => void;
  onAttach: (file: File | undefined) => void;
  onRemoveFile: () => void;
}) {
  return (
    <Paper
      component="form"
      onSubmit={props.onSubmit}
      sx={(theme) => ({
        ...glass(theme, 0.85),
        position: 'sticky',
        bottom: { xs: `calc(${MOBILE_NAV_OFFSET} + 12px)`, md: 16 },
        p: 1,
        pl: 1.5,
        borderRadius: '24px',
      })}
    >
      <Stack spacing={1}>
        {(props.file || props.fileError || props.waiting) && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap', px: 0.5, pt: 0.5 }}
          >
            {props.file && (
              <Chip
                icon={<AttachFileOutlined />}
                label={props.file.name}
                onDelete={props.busy ? undefined : props.onRemoveFile}
              />
            )}
            {props.waiting && (
              <Typography variant="caption" color="text.secondary">
                Confirma o cancela la propuesta para continuar.
              </Typography>
            )}
          </Stack>
        )}
        {props.fileError && <Alert severity="error">{props.fileError}</Alert>}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <IconButton
            component="label"
            disabled={props.busy}
            title="Adjuntar factura"
            sx={{ mb: 0.25 }}
          >
            <AttachFileOutlined />
            <input
              hidden
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              aria-label="Archivo de la factura"
              onChange={(e) => {
                props.onAttach(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </IconButton>
          <TextField
            placeholder="Escribe un mensaje…"
            value={props.draft}
            onChange={(e) => props.onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.closest('form')?.requestSubmit();
              }
            }}
            multiline
            maxRows={6}
            disabled={props.locked}
            slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Mensaje' } }}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: '18px', bgcolor: 'transparent' },
              '& .MuiOutlinedInput-notchedOutline': { border: 0 },
            }}
          />
          <IconButton
            type="submit"
            aria-label="Enviar"
            disabled={props.locked || !props.draft.trim()}
            sx={{
              mb: 0.25,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
            }}
          >
            <ArrowUpwardOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
    </Paper>
  );
}

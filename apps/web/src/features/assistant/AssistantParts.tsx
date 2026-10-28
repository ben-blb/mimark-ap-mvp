import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import StopRounded from '@mui/icons-material/StopRounded';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FormEvent, ReactNode, Ref } from 'react';
import { MOBILE_NAV_OFFSET, RADIUS } from '../../app/theme';
import { formatBytes } from '../../lib/format';
import type { Suggestion } from './suggestions';

/** Entrada de un mensaje: fade + 4 px, 150 ms (se quita con movimiento reducido). */
export const ENTER = {
  animation: 'mimark-enter 150ms ease-out',
  '@keyframes mimark-enter': {
    from: { opacity: 0, transform: 'translateY(4px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;

/** Chips de texto que rellenan el compositor (no envían). */
export function SuggestionChips(props: {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
  'aria-label': string;
}) {
  if (props.suggestions.length === 0) return null;
  return (
    <Stack
      direction="row"
      aria-label={props['aria-label']}
      role="group"
      sx={{ flexWrap: 'wrap', gap: 1 }}
    >
      {props.suggestions.map((s) => (
        <Chip
          key={s.label}
          label={s.label}
          variant="outlined"
          onClick={() => props.onPick(s.prompt)}
          sx={{
            height: 'auto',
            py: 0.5,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
            '& .MuiChip-label': { whiteSpace: 'normal' },
          }}
        />
      ))}
    </Stack>
  );
}

/** Conversación vacía: sugerencias hechas con datos del tablero (AC-010-08). */
export function EmptyChat(props: { suggestions: Suggestion[]; onPick: (prompt: string) => void }) {
  return (
    <Box sx={{ py: { xs: 2, sm: 6 } }}>
      <Typography variant="h2" sx={{ mb: 0.5 }}>
        ¿Qué revisamos?
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
        Pregunta por la cartera o pide una operación; lo que cambia datos te lo pido confirmar.
      </Typography>
      <SuggestionChips
        aria-label="Sugerencias"
        suggestions={props.suggestions}
        onPick={props.onPick}
      />
    </Box>
  );
}

/** Cursor discreto al final del texto que va llegando. */
export function LiveCursor() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-block',
        width: '0.5em',
        height: '1em',
        ml: 0.25,
        verticalAlign: 'text-bottom',
        bgcolor: 'text.tertiary',
        animation: 'mimark-blink 1s steps(2, start) infinite',
        '@keyframes mimark-blink': { to: { visibility: 'hidden' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}

/** Capa al arrastrar un archivo sobre el panel. */
export function DropOverlay() {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: { xs: 0, md: '0 0 0 220px' },
        zIndex: (theme) => theme.zIndex.modal,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'rgba(10 9 8 / 0.7)',
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          px: 4,
          py: 3,
          border: '1px dashed',
          borderColor: 'primary.main',
          borderRadius: RADIUS.container,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        Suelta la factura (PDF, PNG o JPG)
      </Box>
    </Box>
  );
}

/**
 * Compositor al pie (AC-010-08): borde de 1 px, crece hasta 6 líneas, Enter envía y Mayús+Enter hace salto de
 * línea. Mientras el asistente responde, el botón es «Detener».
 */
export function Composer(props: {
  draft: string;
  onDraftChange: (text: string) => void;
  file: File | null;
  fileError: string | null;
  streaming: boolean;
  locked: boolean;
  waiting: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  onAttach: (file: File | undefined) => void;
  onRemoveFile: () => void;
  footer?: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: { xs: `calc(${MOBILE_NAV_OFFSET} + 8px)`, md: 0 },
        pt: 1,
        pb: { xs: 0, md: 3 },
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="form"
        onSubmit={props.onSubmit}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: RADIUS.container,
          bgcolor: 'background.surface1',
          p: 1,
          transition: 'border-color 120ms ease',
          '&:focus-within': { borderColor: 'text.tertiary' },
        }}
      >
        {(props.file || props.waiting) && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap', px: 0.5, pb: 1 }}
          >
            {props.file && (
              <Chip
                icon={<AttachFileOutlined />}
                label={`${props.file.name} · ${formatBytes(props.file.size)}`}
                onDelete={props.streaming ? undefined : props.onRemoveFile}
                sx={{ maxWidth: '100%' }}
              />
            )}
            {props.waiting && (
              <Typography variant="caption" color="text.secondary">
                Confirma o cancela la propuesta para continuar.
              </Typography>
            )}
          </Stack>
        )}
        {props.fileError && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {props.fileError}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <IconButton
            component="label"
            disabled={props.streaming}
            title="Adjuntar factura"
            size="small"
          >
            <AttachFileOutlined fontSize="small" />
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
          <InputBase
            inputRef={props.inputRef}
            placeholder="Pregunta o pide una operación…  (⌘K)"
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
            inputProps={{ maxLength: 2000, 'aria-label': 'Mensaje' }}
            sx={{ flexGrow: 1, py: 0.5, fontSize: '0.875rem', lineHeight: 1.55 }}
          />
          {props.streaming ? (
            <IconButton aria-label="Detener" title="Detener" size="small" onClick={props.onStop}>
              <StopRounded fontSize="small" />
            </IconButton>
          ) : (
            <IconButton
              type="submit"
              aria-label="Enviar"
              size="small"
              disabled={props.locked || !props.draft.trim()}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark', color: 'primary.contrastText' },
                '&.Mui-disabled': { bgcolor: 'background.surface2', color: 'text.tertiary' },
              }}
            >
              <ArrowUpwardOutlined fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Box>
      {props.footer}
    </Box>
  );
}

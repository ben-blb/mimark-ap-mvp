import type { ConversationSummary } from '@mimark/contracts/conversations';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { RADIUS } from '../../app/theme';
import { formatDateTime } from '../../lib/format';

/**
 * Las conversaciones guardadas de la persona (spec 011): abrir una, empezar una nueva o eliminar una, pidiendo
 * confirmación antes de borrar. Los títulos salen de lo que escribió la persona: se muestran como texto.
 */
export function ConversationList(props: {
  items: ConversationSummary[];
  currentId: string;
  busy: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (props.items.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Todavía no hay conversaciones guardadas.
      </Typography>
    );
  }
  return (
    <Stack
      component="ul"
      aria-label="Conversaciones guardadas"
      sx={{
        listStyle: 'none',
        m: 0,
        mb: 2.5,
        p: 0,
        border: 1,
        borderColor: 'divider',
        borderRadius: RADIUS.container,
        maxHeight: 260,
        overflowY: 'auto',
      }}
    >
      {props.items.map((item) => (
        <Stack
          key={item.id}
          component="li"
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            '&:last-child': { borderBottom: 0 },
          }}
        >
          {confirming === item.id ? (
            <>
              <Typography variant="body2" sx={{ flexGrow: 1, overflowWrap: 'anywhere' }}>
                ¿Eliminar «{item.title}»?
              </Typography>
              <Button
                size="small"
                color="error"
                onClick={() => {
                  setConfirming(null);
                  props.onDelete(item.id);
                }}
              >
                Eliminar
              </Button>
              <Button size="small" color="inherit" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Box
                component="button"
                type="button"
                disabled={props.busy}
                aria-current={item.id === props.currentId ? 'true' : undefined}
                onClick={() => props.onOpen(item.id)}
                sx={{
                  flexGrow: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'none',
                  border: 0,
                  p: 0.5,
                  cursor: 'pointer',
                  color: 'text.primary',
                  font: 'inherit',
                  fontWeight: item.id === props.currentId ? 600 : 400,
                }}
              >
                <Typography component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {item.title}
                </Typography>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ display: 'block', color: 'text.tertiary' }}
                >
                  {formatDateTime(item.updatedAt)}
                </Typography>
              </Box>
              <Button
                size="small"
                color="inherit"
                aria-label={`Eliminar ${item.title}`}
                onClick={() => setConfirming(item.id)}
              >
                Eliminar
              </Button>
            </>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

import type { PayableDto } from '@mimark/contracts/payables';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { PAYABLE_ACTION_LABELS } from '../../lib/labels';

export type PayableAction = PayableDto['allowedActions'][number];

/**
 * Un botón por cada acción de `allowedActions` y nada más: la UI no repite la tabla de estados de la API.
 */
export function ActionBar(props: {
  actions: PayableAction[];
  onAction: (action: PayableAction) => void;
  /** Acción en curso: su botón muestra progreso y todos se desactivan. */
  pending?: PayableAction | null;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      role="group"
      aria-label="Acciones del expediente"
      sx={{ flexWrap: { sm: 'wrap' }, rowGap: 1, '& > .MuiButton-root': { flexShrink: 0 } }}
    >
      {props.actions.map((action) => (
        <Button
          key={action}
          variant={action === 'confirm' || action === 'pay' ? 'contained' : 'outlined'}
          color={action === 'discard' ? 'error' : 'primary'}
          loading={props.pending === action}
          disabled={!!props.pending}
          onClick={() => props.onAction(action)}
        >
          {PAYABLE_ACTION_LABELS[action]}
        </Button>
      ))}
    </Stack>
  );
}

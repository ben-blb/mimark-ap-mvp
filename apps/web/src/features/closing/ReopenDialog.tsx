import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { ApiError } from '../../lib/api-client';
import { useReopenPeriod } from './review.api';

/** Reabrir un periodo cerrado exige un motivo, que queda en la auditoría (AC-023-15). */
export function ReopenDialog(props: { periodId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reopen = useReopenPeriod();
  const fieldErrors = reopen.error instanceof ApiError ? reopen.error.fieldErrors : {};
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Reabrir periodo</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TextField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={!!fieldErrors.reason || !!reopen.error}
          helperText={fieldErrors.reason ?? reopen.error?.message ?? 'Explica por qué se reabre'}
          multiline
          minRows={2}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={props.onClose}>
          Cancelar
        </Button>
        <Button
          disabled={reopen.isPending || reason.trim().length < 5}
          onClick={() =>
            reopen.mutate({ periodId: props.periodId, reason }, { onSuccess: props.onClose })
          }
        >
          Reabrir
        </Button>
      </DialogActions>
    </Dialog>
  );
}

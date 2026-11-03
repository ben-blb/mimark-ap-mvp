import { type PurchaseOrderDto, ReceiptInput } from '@mimark/contracts/purchase-orders';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';
import { useConfirmReceipt } from './purchase-orders.api';
import { localToday } from './today';

/**
 * Confirmar la llegada de una OC. Con partidas es un checklist: se marcan todas (la API lo exige) y el
 * botón queda fijo abajo con el contador. Sin partidas (OC anteriores) solo se pide fecha y notas.
 */
export function ReceiptDialog({
  order,
  onClose,
}: {
  order: PurchaseOrderDto;
  onClose: () => void;
}) {
  const confirm = useConfirmReceipt(order.id);
  const error = confirm.error;
  const fullScreen = useMediaQuery('(max-width:599.95px)');
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const form = useZodForm(
    ReceiptInput,
    { receivedOn: localToday(), notes: '' },
    error instanceof ApiError ? error.fieldErrors : {},
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;
  const total = order.lines.length;
  const complete = checked.size === total;
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>Confirmar recepción de {order.number}</DialogTitle>
      <Stack
        component="form"
        noValidate
        sx={{ flex: 1, minHeight: 0 }}
        onSubmit={form.handleSubmit((values) =>
          confirm.mutate(
            { ...values, notes: values.notes || undefined, checkedLineIds: [...checked] },
            { onSuccess: onClose },
          ),
        )}
      >
        <DialogContent sx={{ pt: '8px !important' }}>
          <Stack spacing={1}>
            <TextField
              label="Fecha de recepción"
              type="date"
              slotProps={{
                htmlInput: { min: order.issuedOn, max: localToday() },
                inputLabel: { shrink: true },
              }}
              {...form.field('receivedOn')}
            />
            <TextField label="Notas (opcional)" multiline minRows={2} {...form.field('notes')} />
            {total > 0 && (
              <>
                <Stack
                  direction="row"
                  sx={{ alignItems: 'center', justifyContent: 'space-between', pt: 1 }}
                >
                  <Typography variant="subtitle2" aria-live="polite">
                    {checked.size} de {total} recibidas
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setChecked(new Set(order.lines.map((l) => l.id)))}
                    disabled={complete}
                  >
                    Marcar todo
                  </Button>
                </Stack>
                <List
                  aria-label="Partidas por recibir"
                  disablePadding
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
                >
                  {order.lines.map((line) => (
                    <ListItemButton
                      key={line.id}
                      onClick={() => toggle(line.id)}
                      sx={{ minHeight: 56, borderBottom: 1, borderColor: 'divider' }}
                    >
                      <ListItemIcon sx={{ minWidth: 44 }}>
                        <Checkbox
                          edge="start"
                          checked={checked.has(line.id)}
                          tabIndex={-1}
                          disableRipple
                          slotProps={{
                            input: { 'aria-label': `Recibida: ${line.description}` },
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={line.description}
                        secondary={`${line.sku ? `${line.sku} · ` : ''}${line.quantity} ${line.unit}`}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {form.errors.checkedLineIds && (
                  <Typography variant="caption" color="error">
                    {form.errors.checkedLineIds}
                  </Typography>
                )}
              </>
            )}
            <ErrorAlert error={generalError} />
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            px: 3,
            py: 1.5,
          }}
        >
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            variant="contained"
            loading={confirm.isPending}
            disabled={!complete}
          >
            Confirmar recepción
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}

import { type PurchaseOrderDto, ReceiptInput } from '@mimark/contracts/purchase-orders';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';
import { useConfirmReceipt } from './purchase-orders.api';
import { localToday } from './today';

export function ReceiptDialog({
  order,
  onClose,
}: {
  order: PurchaseOrderDto;
  onClose: () => void;
}) {
  const confirm = useConfirmReceipt(order.id);
  const error = confirm.error;
  const form = useZodForm(
    ReceiptInput,
    { receivedOn: localToday(), notes: '' },
    error instanceof ApiError ? error.fieldErrors : {},
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Confirmar recepción de {order.number}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack
          component="form"
          spacing={1}
          noValidate
          onSubmit={form.handleSubmit((values) =>
            confirm.mutate({ ...values, notes: values.notes || undefined }, { onSuccess: onClose }),
          )}
        >
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
          <ErrorAlert error={generalError} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
            <Button onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="contained" loading={confirm.isPending}>
              Confirmar
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

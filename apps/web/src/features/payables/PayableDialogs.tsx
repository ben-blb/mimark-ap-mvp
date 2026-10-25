import type { PayableDto } from '@mimark/contracts/payables';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { formatDate, formatMoney } from '../../lib/format';
import { localToday } from '../purchase-orders/today';
import { CorrectFieldsForm } from './CorrectFieldsForm';
import {
  useCorrectPayable,
  useDiscardPayable,
  useDocumentsPayable,
  usePayPayable,
  useSchedulePayable,
} from './payables.api';
import { nextPayDays } from './pay-days';

interface Props {
  payable: PayableDto;
  onClose: () => void;
}

function Shell(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>{props.children}</DialogContent>
    </Dialog>
  );
}

const fieldErrorsOf = (error: unknown) => (error instanceof ApiError ? error.fieldErrors : {});
const generalErrorOf = (error: unknown) =>
  error instanceof ApiError && error.code === 'VALIDATION' ? null : error;

function Buttons(props: {
  onCancel: () => void;
  pending: boolean;
  submit: string;
  disabled?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
      <Button onClick={props.onCancel}>Cancelar</Button>
      <Button type="submit" variant="contained" loading={props.pending} disabled={props.disabled}>
        {props.submit}
      </Button>
    </Stack>
  );
}

export function CorrectDialog({ payable, onClose }: Props) {
  const correct = useCorrectPayable(payable.id);
  return (
    <Shell title="Corregir datos" onClose={onClose}>
      <CorrectFieldsForm
        payable={payable}
        pending={correct.isPending}
        error={correct.error}
        onSubmit={(input) => correct.mutate(input, { onSuccess: onClose })}
        onCancel={onClose}
      />
    </Shell>
  );
}

export function ScheduleDialog({ payable, onClose }: Props) {
  const schedule = useSchedulePayable(payable.id);
  const options = nextPayDays(localToday());
  const suggested = payable.schedule?.scheduledPayOn ?? payable.schedule?.suggestedPayOn;
  const [payOn, setPayOn] = useState(
    suggested && options.includes(suggested) ? suggested : (options[0] ?? ''),
  );
  const errors = fieldErrorsOf(schedule.error);
  return (
    <Shell title="Programar pago" onClose={onClose}>
      <Stack
        component="form"
        spacing={1}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          schedule.mutate({ payOn }, { onSuccess: onClose });
        }}
      >
        {payable.schedule && (
          <Typography variant="body2">
            Vence el {formatDate(payable.schedule.dueOn)}. Pago sugerido:{' '}
            {formatDate(payable.schedule.suggestedPayOn)}.
          </Typography>
        )}
        <TextField
          select
          label="Día de pago"
          value={payOn}
          onChange={(e) => setPayOn(e.target.value)}
          error={!!errors.payOn}
          helperText={errors.payOn ?? 'Se paga solo miércoles y viernes.'}
          slotProps={{ select: { native: true } }}
        >
          {options.map((day) => (
            <option key={day} value={day}>
              {formatDate(day)}
              {day === payable.schedule?.suggestedPayOn ? ' (sugerido)' : ''}
            </option>
          ))}
        </TextField>
        <ErrorAlert error={generalErrorOf(schedule.error)} />
        <Buttons onCancel={onClose} pending={schedule.isPending} submit="Programar" />
      </Stack>
    </Shell>
  );
}

export function PaymentDialog({ payable, onClose }: Props) {
  const pay = usePayPayable(payable.id);
  const [paidOn, setPaidOn] = useState(localToday());
  const [reference, setReference] = useState('');
  const errors = fieldErrorsOf(pay.error);
  const total = payable.fields.total ?? '0.00';
  const currency = payable.fields.currency ?? 'MXN';
  return (
    <Shell title="Registrar pago" onClose={onClose}>
      <Stack
        component="form"
        spacing={1}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate({ paidOn, amount: total, reference }, { onSuccess: onClose });
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Esto solo registra un pago que ya hiciste; el sistema no ejecuta transferencias.
        </Typography>
        <TextField
          label="Fecha de pago"
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          error={!!errors.paidOn}
          helperText={errors.paidOn ?? ' '}
          slotProps={{ htmlInput: { max: localToday() }, inputLabel: { shrink: true } }}
        />
        <TextField
          label="Importe"
          value={formatMoney(total, currency)}
          helperText="Debe ser igual al total de la factura."
          slotProps={{ input: { readOnly: true } }}
        />
        <TextField
          label="Referencia"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={!!errors.reference}
          helperText={errors.reference ?? 'Folio de la transferencia o del cheque.'}
        />
        <ErrorAlert error={generalErrorOf(pay.error)} />
        <Buttons onCancel={onClose} pending={pay.isPending} submit="Registrar" />
      </Stack>
    </Shell>
  );
}

/** Los interruptores guardan al moverse: lo que ves es lo que dice el servidor. */
export function DocumentsDialog({ payable, onClose }: Props) {
  const update = useDocumentsPayable(payable.id);
  const documents = payable.documents;
  return (
    <Shell title="Documentos del expediente" onClose={onClose}>
      <Stack spacing={1}>
        <FormControlLabel
          control={
            <Switch
              checked={documents?.invoice === 'received'}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({ invoiceDocStatus: e.target.checked ? 'received' : 'pending' })
              }
            />
          }
          label="Factura recibida"
        />
        {documents?.complement != null && (
          <FormControlLabel
            control={
              <Switch
                checked={documents.complement === 'received'}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ complementStatus: e.target.checked ? 'received' : 'pending' })
                }
              />
            }
            label="Complemento de pago recibido"
          />
        )}
        <ErrorAlert error={update.error} />
        <Stack direction="row" sx={{ justifyContent: 'flex-end', pt: 1 }}>
          <Button onClick={onClose}>Cerrar</Button>
        </Stack>
      </Stack>
    </Shell>
  );
}

export function DiscardDialog({ payable, onClose }: Props) {
  const discard = useDiscardPayable(payable.id);
  const [reason, setReason] = useState('');
  const errors = fieldErrorsOf(discard.error);
  return (
    <Shell title="Descartar expediente" onClose={onClose}>
      <Stack
        component="form"
        spacing={1}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          discard.mutate({ reason }, { onSuccess: onClose });
        }}
      >
        <Typography variant="body2">
          Un expediente descartado deja de contar para duplicados y para la orden de compra, y ya no
          se puede reabrir.
        </Typography>
        <TextField
          label="Motivo"
          multiline
          minRows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={!!errors.reason}
          helperText={errors.reason ?? ' '}
        />
        <ErrorAlert error={generalErrorOf(discard.error)} />
        <Buttons onCancel={onClose} pending={discard.isPending} submit="Descartar" />
      </Stack>
    </Shell>
  );
}

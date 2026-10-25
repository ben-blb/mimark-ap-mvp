import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { REVIEW_REASON_LABELS } from '../../lib/labels';
import { ActionBar, type PayableAction } from './ActionBar';
import { PayableDetail } from './PayableDetail';
import {
  CorrectDialog,
  DiscardDialog,
  DocumentsDialog,
  PaymentDialog,
  ScheduleDialog,
} from './PayableDialogs';
import { useConfirmPayable, usePayable, usePayableHistory, useRetryPayable } from './payables.api';

type DialogName = 'correct' | 'schedule' | 'pay' | 'documents' | 'discard';
const DIALOG_ACTIONS: PayableAction[] = ['correct', 'schedule', 'pay', 'documents', 'discard'];

export function PayableDetailPage() {
  const { id = '' } = useParams();
  const payable = usePayable(id);
  const history = usePayableHistory(id);
  const retry = useRetryPayable(id);
  const confirm = useConfirmPayable(id);
  const [dialog, setDialog] = useState<DialogName | null>(null);

  if (payable.isPending) return <LinearProgress />;
  if (!payable.data) return <ErrorAlert error={payable.error} />;
  const data = payable.data;

  function onAction(action: PayableAction) {
    if (action === 'retry') retry.mutate();
    else if (action === 'confirm') confirm.mutate();
    else if (DIALOG_ACTIONS.includes(action)) setDialog(action);
  }
  const close = () => setDialog(null);
  const pending = retry.isPending ? 'retry' : confirm.isPending ? 'confirm' : null;
  const newReasons =
    confirm.error instanceof ApiError && confirm.error.code === 'REVIEW_REQUIRED'
      ? (confirm.error.details.reasons as string[] | undefined)
      : undefined;

  return (
    <>
      <ErrorAlert error={retry.error} />
      {newReasons ? (
        <Alert severity="warning" role="alert" sx={{ mb: 2 }}>
          Antes de confirmar hay que revisar el expediente:{' '}
          {newReasons
            .map(
              (r) =>
                REVIEW_REASON_LABELS[r.split(':')[0] as keyof typeof REVIEW_REASON_LABELS] ?? r,
            )
            .join(' · ')}
        </Alert>
      ) : (
        <ErrorAlert error={confirm.error} />
      )}
      <PayableDetail
        payable={data}
        history={history.data?.items ?? []}
        actions={<ActionBar actions={data.allowedActions} onAction={onAction} pending={pending} />}
      />
      {dialog === 'correct' && <CorrectDialog payable={data} onClose={close} />}
      {dialog === 'schedule' && <ScheduleDialog payable={data} onClose={close} />}
      {dialog === 'pay' && <PaymentDialog payable={data} onClose={close} />}
      {dialog === 'documents' && <DocumentsDialog payable={data} onClose={close} />}
      {dialog === 'discard' && <DiscardDialog payable={data} onClose={close} />}
    </>
  );
}

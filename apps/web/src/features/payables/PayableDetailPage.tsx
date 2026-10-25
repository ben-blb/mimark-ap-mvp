import LinearProgress from '@mui/material/LinearProgress';
import { useParams } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PayableDetail } from './PayableDetail';
import { usePayable, usePayableHistory, useRetryPayable } from './payables.api';

export function PayableDetailPage() {
  const { id = '' } = useParams();
  const payable = usePayable(id);
  const history = usePayableHistory(id);
  const retry = useRetryPayable(id);

  if (payable.isPending) return <LinearProgress />;
  if (!payable.data) return <ErrorAlert error={payable.error} />;

  return (
    <>
      <ErrorAlert error={retry.error} />
      <PayableDetail
        payable={payable.data}
        history={history.data?.items ?? []}
        retrying={retry.isPending}
        onRetry={() => retry.mutate()}
      />
    </>
  );
}

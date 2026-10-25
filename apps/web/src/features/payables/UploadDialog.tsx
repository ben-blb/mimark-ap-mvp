import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import { Link as RouterLink, useNavigate } from 'react-router';
import { ApiError } from '../../lib/api-client';
import { usePurchaseOrders } from '../purchase-orders/purchase-orders.api';
import { localToday } from '../purchase-orders/today';
import { useUploadPayable } from './payables.api';
import { UploadForm, type UploadValues } from './UploadForm';

/** Conecta el formulario con la API. Al terminar abre el detalle del expediente. */
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const orders = usePurchaseOrders({ status: 'open' });
  const upload = useUploadPayable();
  const navigate = useNavigate();

  function submit(values: UploadValues) {
    const form = new FormData();
    form.append('file', values.file);
    if (values.purchaseOrderNumber) form.append('purchaseOrderNumber', values.purchaseOrderNumber);
    if (values.invoiceReceivedOn) form.append('invoiceReceivedOn', values.invoiceReceivedOn);
    upload.mutate(form, { onSuccess: (payable) => void navigate(`/expedientes/${payable.id}`) });
  }

  const failedId =
    upload.error instanceof ApiError && typeof upload.error.details.payableId === 'string'
      ? upload.error.details.payableId
      : null;

  return (
    <Dialog open onClose={upload.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Subir documento</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <UploadForm
          orders={(orders.data?.items ?? []).map((o) => ({
            id: o.id,
            number: o.number,
            supplierName: o.supplier.name,
          }))}
          today={localToday()}
          pending={upload.isPending}
          error={upload.error}
          failedLink={
            failedId && (
              <Link component={RouterLink} to={`/expedientes/${failedId}`}>
                Ver el expediente y reintentar
              </Link>
            )
          }
          onSubmit={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

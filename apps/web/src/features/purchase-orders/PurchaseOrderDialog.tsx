import type { PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useSuppliers } from '../suppliers/suppliers.api';
import { localToday } from './today';
import { PurchaseOrderForm, type PurchaseOrderFormValues } from './PurchaseOrderForm';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from './purchase-orders.api';

/** Conecta el formulario con la API: alta si no hay `order`, edición si la hay. */
export function PurchaseOrderDialog({
  order,
  onClose,
}: {
  order?: PurchaseOrderDto;
  onClose: () => void;
}) {
  const suppliers = useSuppliers({ status: 'active' });
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder(order?.id ?? '');
  const mutation = order ? update : create;

  function submit(values: PurchaseOrderFormValues) {
    if (order) {
      const { number: _number, supplierId: _supplierId, ...changes } = values;
      update.mutate(changes, { onSuccess: onClose });
    } else {
      const { status: _status, ...data } = values;
      create.mutate(
        { ...data, parlevelRef: data.parlevelRef || undefined },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{order ? `Editar ${order.number}` : 'Nueva orden de compra'}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        {(order || suppliers.data) && (
          <PurchaseOrderForm
            order={order}
            suppliers={suppliers.data?.items ?? []}
            today={localToday()}
            pending={mutation.isPending}
            error={mutation.error}
            onSubmit={submit}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

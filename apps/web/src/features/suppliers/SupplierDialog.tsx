import type { SupplierDto } from '@mimark/contracts/suppliers';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { SupplierForm, type SupplierFormValues } from './SupplierForm';
import { useCreateSupplier, useUpdateSupplier } from './suppliers.api';

/** Conecta el formulario con la API: alta si no hay `supplier`, edición si lo hay. */
export function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier?: SupplierDto;
  onClose: () => void;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplier?.id ?? '');
  const mutation = supplier ? update : create;

  function submit(values: SupplierFormValues) {
    const { active, ...data } = values;
    if (supplier) update.mutate({ ...data, active }, { onSuccess: onClose });
    else create.mutate(data, { onSuccess: onClose });
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <SupplierForm
          supplier={supplier}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

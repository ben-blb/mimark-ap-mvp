import type { SupplierDto } from '@mimark/contracts/suppliers';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { SupplierForm, type SupplierFormValues } from './SupplierForm';
import { useCreateSupplier, useUpdateSupplier } from './suppliers.api';

/** Conecta el formulario con la API: alta si no hay `supplier`, edición si lo hay. */
export function SupplierDialog({
  supplier,
  initial,
  onSaved,
  onClose,
}: {
  supplier?: SupplierDto;
  /** Valores iniciales de un alta (p. ej. desde el PDF de ParLevel). */
  initial?: { name?: string; parlevelName?: string };
  /** Se llama con el proveedor guardado, antes de cerrar. */
  onSaved?: (supplier: SupplierDto) => void;
  onClose: () => void;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplier?.id ?? '');
  const mutation = supplier ? update : create;

  function submit(values: SupplierFormValues) {
    const { active, ...data } = values;
    const onSuccess = (saved: SupplierDto) => {
      onSaved?.(saved);
      onClose();
    };
    if (supplier) update.mutate({ ...data, active }, { onSuccess });
    else create.mutate(data, { onSuccess });
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <SupplierForm
          supplier={supplier}
          initial={initial}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

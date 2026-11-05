import type { PurchaseOrderDraft, PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import type { SupplierDto } from '@mimark/contracts/suppliers';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { useCan } from '../session/session.api';
import { SupplierDialog } from '../suppliers/SupplierDialog';
import { useSuppliers } from '../suppliers/suppliers.api';
import { localToday } from './today';
import { PurchaseOrderForm, type PurchaseOrderFormValues } from './PurchaseOrderForm';
import {
  useCreatePurchaseOrder,
  useExtractPurchaseOrder,
  useUpdatePurchaseOrder,
} from './purchase-orders.api';

/** Origen de una OC nueva: PDF de ParLevel (con paso de verificación) o captura a mano. */
type Step = { kind: 'origin' } | { kind: 'form'; draft?: PurchaseOrderDraft };

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
  const extract = useExtractPurchaseOrder();
  const mutation = order ? update : create;
  const [step, setStep] = useState<Step>(order ? { kind: 'form' } : { kind: 'origin' });
  const fullScreen = useMediaQuery('(max-width:599.95px)');
  const can = useCan();
  /** Alta del proveedor que sugiere el PDF (spec 015): el diálogo de proveedores se abre encima. */
  const [registering, setRegistering] = useState<{ name: string } | null>(null);
  const [registered, setRegistered] = useState<SupplierDto | null>(null);
  const supplierOptions = [
    ...(suppliers.data?.items ?? []).filter((s) => s.id !== registered?.id),
    ...(registered ? [registered] : []),
  ];

  function submit(values: PurchaseOrderFormValues) {
    if (order) {
      const { number: _number, supplierId: _supplierId, lines, ...changes } = values;
      // Las partidas solo se reemplazan mientras la recepción esté pendiente y haya alguna que enviar.
      const sendLines = order.receiptStatus === 'pending' && lines.length > 0;
      update.mutate(sendLines ? { ...changes, lines } : changes, { onSuccess: onClose });
    } else {
      const { status: _status, ...data } = values;
      create.mutate(
        { ...data, parlevelRef: data.parlevelRef || undefined, lines: data.lines },
        { onSuccess: onClose },
      );
    }
  }

  function readFile(file: File | undefined) {
    if (file) extract.mutate(file, { onSuccess: (draft) => setStep({ kind: 'form', draft }) });
  }

  const title = order
    ? `Editar ${order.number}`
    : step.kind === 'form' && step.draft
      ? 'Verificar la orden leída del PDF'
      : 'Nueva orden de compra';

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        {step.kind === 'origin' ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Sube el PDF que genera ParLevel y revisa lo que se lee antes de guardar, o captura la
              orden a mano.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                component="label"
                variant="contained"
                startIcon={<UploadFileOutlined />}
                loading={extract.isPending}
              >
                Subir PDF de ParLevel
                <input
                  hidden
                  type="file"
                  accept="application/pdf"
                  aria-label="Archivo PDF de ParLevel"
                  onChange={(e) => {
                    readFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </Button>
              <Button
                variant="outlined"
                startIcon={<EditOutlined />}
                onClick={() => setStep({ kind: 'form' })}
                disabled={extract.isPending}
              >
                Capturar a mano
              </Button>
            </Stack>
            <ErrorAlert error={extract.error} />
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>Cancelar</Button>
            </Stack>
          </Stack>
        ) : (
          (order || suppliers.data) && (
            <PurchaseOrderForm
              order={order}
              draft={step.draft}
              suppliers={supplierOptions}
              registeredSupplierId={registered?.id}
              onRegisterSupplier={
                can('suppliers:write') ? (s) => setRegistering({ name: s.name }) : undefined
              }
              today={localToday()}
              pending={mutation.isPending}
              error={mutation.error}
              onSubmit={submit}
              onCancel={onClose}
            />
          )
        )}
      </DialogContent>
      {registering && (
        <SupplierDialog
          initial={{ name: registering.name, parlevelName: registering.name }}
          onSaved={setRegistered}
          onClose={() => setRegistering(null)}
        />
      )}
    </Dialog>
  );
}

import type { PurchaseOrderDto } from '@mimark/contracts/purchase-orders';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { MONO } from '../../app/theme';
import { ErrorAlert } from '../../components/ErrorAlert';
import { FlowSteps } from '../../components/FlowSteps';
import { Money } from '../../components/Money';
import { PageHeader } from '../../components/PageHeader';
import { formatDay, paymentTermLabel } from '../../lib/format';
import { PO_STAGE_LABELS } from '../../lib/labels';
import { UploadDialog } from '../payables/UploadDialog';
import { useCan } from '../session/session.api';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import { poFlowSteps } from './po-steps';
import { usePurchaseOrder } from './purchase-orders.api';

const isShort = (line: PurchaseOrderDto['lines'][number]) =>
  line.receivedQuantity !== null && Number(line.receivedQuantity) < Number(line.quantity);

/** La única acción principal: la del paso que sigue, solo si el rol puede hacerla (AC-019-12). */
function NextAction(props: { order: PurchaseOrderDto; onEdit: () => void; onInvoice: () => void }) {
  const can = useCan();
  const { stage, invoice } = props.order.progress;
  if (stage === 'cancelled') return null;
  if (stage === 'to_receive') {
    return can('orders:write') ? (
      <Button variant="contained" onClick={props.onEdit}>
        Editar
      </Button>
    ) : (
      <Typography color="text.secondary">Esperando a Almacén</Typography>
    );
  }
  if (stage === 'to_invoice') {
    return can('payables:write') ? (
      <Button variant="contained" onClick={props.onInvoice}>
        Cargar factura
      </Button>
    ) : (
      <Typography color="text.secondary">Esperando a Cuentas por pagar</Typography>
    );
  }
  if (can('payables:read') && invoice) {
    return (
      <Button variant="contained" component={RouterLink} to={`/expedientes/${invoice.payableId}`}>
        Ver factura
      </Button>
    );
  }
  return stage === 'paid' ? null : (
    <Typography color="text.secondary">Esperando a Cuentas por pagar</Typography>
  );
}

/** Una orden con su avance en el proceso, sus partidas pedido / recibido y la acción que sigue (spec 019). */
export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const query = usePurchaseOrder(id);
  const [dialog, setDialog] = useState<'edit' | 'invoice' | null>(null);

  if (query.isPending) return <LinearProgress />;
  if (!query.data) return <ErrorAlert error={query.error} />;
  const order = query.data;
  const steps = poFlowSteps(order);
  const received = order.receiptStatus !== 'pending';

  return (
    <>
      <PageHeader title={`Orden ${order.number}`} />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
        {order.progress.stage === 'cancelled' ? (
          <Typography sx={{ fontWeight: 600 }}>{PO_STAGE_LABELS.cancelled}</Typography>
        ) : (
          <FlowSteps steps={steps} label="Avance de la orden" />
        )}
        <Box sx={{ mt: 2 }}>
          <NextAction
            order={order}
            onEdit={() => setDialog('edit')}
            onInvoice={() => setDialog('invoice')}
          />
        </Box>
      </Paper>

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={0.5}>
            <Typography sx={{ fontWeight: 600 }}>{order.supplier.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDay(order.issuedOn)} · {paymentTermLabel(order.supplier.creditDays)}
            </Typography>
            <Typography variant="body2">
              Total <Money amount={order.total} currency={order.currency} />
            </Typography>
          </Stack>
        </Paper>

        <Paper
          component="section"
          aria-label="Partidas"
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 } }}
        >
          <Typography variant="h2" sx={{ fontSize: '1rem', mb: 1 }}>
            Partidas
          </Typography>
          {order.lines.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Esta orden no tiene partidas.
            </Typography>
          )}
          <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
            {order.lines.map((line) => (
              <Box component="li" key={line.id}>
                <Typography variant="body2">
                  {line.description}
                  {line.sku && (
                    <Box component="span" sx={{ fontFamily: MONO, ml: 1 }}>
                      {line.sku}
                    </Box>
                  )}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: isShort(line) ? 'warning.dark' : 'text.secondary',
                    fontWeight: isShort(line) ? 600 : 400,
                  }}
                >
                  Pedido {line.quantity} · Recibido {line.receivedQuantity ?? '—'} {line.unit}
                  {isShort(line) &&
                    ` · Faltan ${Number(line.quantity) - Number(line.receivedQuantity)}`}
                </Typography>
              </Box>
            ))}
          </Stack>
          {received && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Recibida el {order.receivedOn ? formatDay(order.receivedOn) : '—'}
              {order.receivedBy ? ` por ${order.receivedBy}` : ''}
              {order.receiptNotes ? ` · ${order.receiptNotes}` : ''}
            </Typography>
          )}
        </Paper>
      </Stack>

      {dialog === 'edit' && <PurchaseOrderDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === 'invoice' && (
        <UploadDialog
          fixedOrder={{ number: order.number, supplierName: order.supplier.name }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

import type { PurchaseOrderDto, PurchaseOrderListQuery } from '@mimark/contracts/purchase-orders';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useDeferredValue, useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { formatDate, formatMoney } from '../../lib/format';
import { PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import { ReceiptDialog } from './ReceiptDialog';
import { usePurchaseOrders } from './purchase-orders.api';

type Status = PurchaseOrderListQuery['status'];
type Receipt = NonNullable<PurchaseOrderListQuery['receipt']> | 'all';
type Dialog =
  { kind: 'edit'; order?: PurchaseOrderDto } | { kind: 'receipt'; order: PurchaseOrderDto } | null;

export function PurchaseOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('open');
  const [receipt, setReceipt] = useState<Receipt>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const orders = usePurchaseOrders({
    search: useDeferredValue(search),
    status,
    receipt: receipt === 'all' ? undefined : receipt,
  });

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        subtitle="Cada factura se valida contra su orden de compra y su recepción."
        actions={
          <Button variant="contained" onClick={() => setDialog({ kind: 'edit' })}>
            Nueva OC
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por folio o proveedor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: { md: 360 } }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          aria-label="Recepción"
          value={receipt}
          onChange={(_, value: Receipt | null) => value && setReceipt(value)}
        >
          <ToggleButton value="all">Toda recepción</ToggleButton>
          <ToggleButton value="pending">Pendientes</ToggleButton>
          <ToggleButton value="received">Recibidas</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          aria-label="Estado"
          value={status}
          onChange={(_, value: Status | null) => value && setStatus(value)}
        >
          <ToggleButton value="open">Abiertas</ToggleButton>
          <ToggleButton value="cancelled">Canceladas</ToggleButton>
          <ToggleButton value="all">Todas</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <ErrorAlert error={orders.error} />
      <TableContainer component={Paper}>
        {orders.isFetching && <LinearProgress />}
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Folio</TableCell>
              <TableCell>Proveedor</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Recepción</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.data?.items.map((order) => (
              <TableRow key={order.id} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>{order.number}</TableCell>
                <TableCell>{order.supplier.name}</TableCell>
                <TableCell>{formatDate(order.issuedOn)}</TableCell>
                <TableCell align="right">{formatMoney(order.total, order.currency)}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={order.receiptStatus === 'received' ? 'success' : 'default'}
                    label={
                      order.receivedOn
                        ? `Recibida ${formatDate(order.receivedOn)} por ${order.receivedBy ?? ''}`
                        : 'Pendiente'
                    }
                  />
                </TableCell>
                <TableCell>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</TableCell>
                <TableCell align="right">
                  {order.status === 'open' && order.receiptStatus === 'pending' && (
                    <Button size="small" onClick={() => setDialog({ kind: 'receipt', order })}>
                      Confirmar recepción
                    </Button>
                  )}
                  <Button size="small" onClick={() => setDialog({ kind: 'edit', order })}>
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {orders.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No hay órdenes con este filtro. Registra una con «Nueva OC».
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {dialog?.kind === 'edit' && (
        <PurchaseOrderDialog order={dialog.order} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'receipt' && (
        <ReceiptDialog order={dialog.order} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

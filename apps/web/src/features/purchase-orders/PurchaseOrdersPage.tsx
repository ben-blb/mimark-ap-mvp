import type { PurchaseOrderDto, PurchaseOrderListQuery } from '@mimark/contracts/purchase-orders';
import AddOutlined from '@mui/icons-material/AddOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useDeferredValue, useState } from 'react';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { ResponsiveList } from '../../components/ResponsiveList';
import { formatDate, formatMoney } from '../../lib/format';
import { PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import { ReceiptDialog } from './ReceiptDialog';
import { usePurchaseOrders } from './purchase-orders.api';

type Status = PurchaseOrderListQuery['status'];
type Receipt = NonNullable<PurchaseOrderListQuery['receipt']> | 'all';
type Dialog =
  { kind: 'edit'; order?: PurchaseOrderDto } | { kind: 'receipt'; order: PurchaseOrderDto } | null;

function ReceiptChip({ order }: { order: PurchaseOrderDto }) {
  return (
    <Chip
      size="small"
      color={order.receiptStatus === 'received' ? 'success' : 'default'}
      label={
        order.receivedOn
          ? `Recibida ${formatDate(order.receivedOn)} por ${order.receivedBy ?? ''}`
          : 'Pendiente'
      }
      sx={{ maxWidth: '100%' }}
    />
  );
}

function OrderActions(props: { order: PurchaseOrderDto; onOpen: (dialog: Dialog) => void }) {
  const { order } = props;
  return (
    <>
      {order.status === 'open' && order.receiptStatus === 'pending' && (
        <Button size="small" onClick={() => props.onOpen({ kind: 'receipt', order })}>
          Confirmar recepción
        </Button>
      )}
      <Button size="small" onClick={() => props.onOpen({ kind: 'edit', order })}>
        Editar
      </Button>
    </>
  );
}

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
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={() => setDialog({ kind: 'edit' })}
          >
            Nueva OC
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Buscar por folio o proveedor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Buscar por folio o proveedor' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
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
      <ResponsiveList
        aria-label="Órdenes de compra"
        items={orders.data?.items}
        loading={orders.isFetching}
        getKey={(order) => order.id}
        empty="No hay órdenes con este filtro. Registra una con «Nueva OC»."
        head={
          <TableRow>
            <TableCell>Folio</TableCell>
            <TableCell>Proveedor</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell>Recepción</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right" />
          </TableRow>
        }
        row={(order) => (
          <TableRow key={order.id} hover>
            <TableCell sx={{ fontFamily: MONO, fontWeight: 600 }}>{order.number}</TableCell>
            <TableCell>{order.supplier.name}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(order.issuedOn)}</TableCell>
            <TableCell
              align="right"
              sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatMoney(order.total, order.currency)}
            </TableCell>
            <TableCell>
              <ReceiptChip order={order} />
            </TableCell>
            <TableCell>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              <OrderActions order={order} onOpen={setDialog} />
            </TableCell>
          </TableRow>
        )}
        card={(order) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: MONO, fontWeight: 600 }}>{order.number}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {order.supplier.name}
                </Typography>
              </Box>
              <Typography
                sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {formatMoney(order.total, order.currency)}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={3}>
              <CardField label="Fecha">{formatDate(order.issuedOn)}</CardField>
              <CardField label="Estado">{PURCHASE_ORDER_STATUS_LABELS[order.status]}</CardField>
            </Stack>
            <Box>
              <ReceiptChip order={order} />
            </Box>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
              <OrderActions order={order} onOpen={setDialog} />
            </Stack>
          </Stack>
        )}
      />

      {dialog?.kind === 'edit' && (
        <PurchaseOrderDialog order={dialog.order} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'receipt' && (
        <ReceiptDialog order={dialog.order} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

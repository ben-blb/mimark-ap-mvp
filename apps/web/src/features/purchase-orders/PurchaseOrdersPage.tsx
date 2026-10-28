import type { PurchaseOrderDto, PurchaseOrderListQuery } from '@mimark/contracts/purchase-orders';
import AddOutlined from '@mui/icons-material/AddOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useDeferredValue, useState } from 'react';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Money } from '../../components/Money';
import { PageHeader } from '../../components/PageHeader';
import { StatusDot } from '../../components/StatusDot';
import { formatDay } from '../../lib/format';
import { PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import { ReceiptDialog } from './ReceiptDialog';
import { usePurchaseOrders } from './purchase-orders.api';

type Dialog =
  { kind: 'edit'; order?: PurchaseOrderDto } | { kind: 'receipt'; order: PurchaseOrderDto } | null;

/** Un solo filtro (AC-010-04): estado y recepción combinados en un select. */
const VIEWS = {
  open: { label: 'Abiertas', query: { status: 'open' } },
  openPending: { label: 'Abiertas · sin recepción', query: { status: 'open', receipt: 'pending' } },
  openReceived: { label: 'Abiertas · recibidas', query: { status: 'open', receipt: 'received' } },
  cancelled: { label: 'Canceladas', query: { status: 'cancelled' } },
  all: { label: 'Todas', query: { status: 'all' } },
} satisfies Record<string, { label: string; query: Partial<PurchaseOrderListQuery> }>;
type View = keyof typeof VIEWS;

/** Recepción: punto + fecha corta, y quién recibió en texto terciario (AC-010-04). */
function Receipt({ order }: { order: PurchaseOrderDto }) {
  if (!order.receivedOn) return <StatusDot tone="warning">Pendiente</StatusDot>;
  return (
    <Box>
      <StatusDot tone="success">{formatDay(order.receivedOn)}</StatusDot>
      {order.receivedBy && (
        <Typography
          variant="caption"
          component="div"
          sx={{ color: 'text.tertiary', pl: 1.75, lineHeight: 1.2 }}
        >
          {order.receivedBy}
        </Typography>
      )}
    </Box>
  );
}

function OrderActions(props: { order: PurchaseOrderDto; onOpen: (dialog: Dialog) => void }) {
  const { order } = props;
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
      {order.status === 'open' && order.receiptStatus === 'pending' && (
        <Button size="small" onClick={() => props.onOpen({ kind: 'receipt', order })}>
          Confirmar recepción
        </Button>
      )}
      <Button size="small" color="inherit" onClick={() => props.onOpen({ kind: 'edit', order })}>
        Editar
      </Button>
    </Stack>
  );
}

export function PurchaseOrdersPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('open');
  const [dialog, setDialog] = useState<Dialog>(null);
  const orders = usePurchaseOrders({ search: useDeferredValue(search), ...VIEWS[view].query });
  // La columna Estado solo informa cuando la vista mezcla abiertas y canceladas.
  const showStatus = view === 'all';

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        actions={
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={() => setDialog({ kind: 'edit' })}
          >
            Nueva orden
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }}>
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
        <TextField
          select
          value={view}
          onChange={(e) => setView(e.target.value as View)}
          slotProps={{ select: { native: true }, htmlInput: { 'aria-label': 'Mostrar' } }}
          sx={{ width: { md: 240 }, flexShrink: 0 }}
        >
          {Object.entries(VIEWS).map(([value, v]) => (
            <option key={value} value={value}>
              {v.label}
            </option>
          ))}
        </TextField>
      </Stack>

      <ErrorAlert error={orders.error} />
      <DataTable
        aria-label="Órdenes de compra"
        items={orders.data?.items}
        loading={orders.isFetching}
        getKey={(order) => order.id}
        empty="No hay órdenes con este filtro. Registra una con «Nueva orden»."
        head={
          <TableRow>
            <TableCell>Folio</TableCell>
            <TableCell>Proveedor</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell>Recepción</TableCell>
            {showStatus && <TableCell>Estado</TableCell>}
            <TableCell align="right" />
          </TableRow>
        }
        row={(order) => (
          <DataRow
            key={order.id}
            onOpen={() => setDialog({ kind: 'edit', order })}
            label={`${order.number} ${order.supplier.name}`}
          >
            <TableCell
              sx={{
                fontFamily: MONO,
                fontSize: '0.8125rem',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {order.number}
            </TableCell>
            <TableCell sx={{ minWidth: 220 }}>
              <Ellipsis maxWidth={320}>{order.supplier.name}</Ellipsis>
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDay(order.issuedOn)}</TableCell>
            <TableCell align="right">
              <Money amount={order.total} currency={order.currency} />
            </TableCell>
            <TableCell sx={{ py: 0.5 }}>
              <Receipt order={order} />
            </TableCell>
            {showStatus && <TableCell>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</TableCell>}
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              <OrderActions order={order} onOpen={setDialog} />
            </TableCell>
          </DataRow>
        )}
        card={(order) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: MONO, fontWeight: 500 }}>{order.number}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {order.supplier.name}
                </Typography>
              </Box>
              <Money amount={order.total} currency={order.currency} />
            </Stack>
            <Stack direction="row" spacing={3}>
              <CardField label="Fecha">{formatDay(order.issuedOn)}</CardField>
              <CardField label="Recepción">
                <Receipt order={order} />
              </CardField>
              {showStatus && (
                <CardField label="Estado">{PURCHASE_ORDER_STATUS_LABELS[order.status]}</CardField>
              )}
            </Stack>
            <OrderActions order={order} onOpen={setDialog} />
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

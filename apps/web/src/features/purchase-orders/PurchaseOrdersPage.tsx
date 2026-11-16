import type {
  PoStage,
  PurchaseOrderDto,
  PurchaseOrderListQuery,
} from '@mimark/contracts/purchase-orders';
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
import { Link as RouterLink, useSearchParams } from 'react-router';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Money } from '../../components/Money';
import { PageHeader } from '../../components/PageHeader';
import { type DotTone, StatusDot } from '../../components/StatusDot';
import { formatDay } from '../../lib/format';
import { PO_STAGE_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../lib/labels';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import { usePurchaseOrders } from './purchase-orders.api';
import { useCan } from '../session/session.api';

type Dialog = { kind: 'edit'; order?: PurchaseOrderDto } | null;

/** Un solo filtro (AC-010-04): estado y recepción combinados en un select. */
const VIEWS = {
  open: { label: 'Abiertas', query: { status: 'open' } },
  openPending: { label: 'Abiertas · sin recepción', query: { status: 'open', receipt: 'pending' } },
  openReceived: { label: 'Abiertas · recibidas', query: { status: 'open', receipt: 'received' } },
  openDifferences: {
    label: 'Abiertas · recibidas con diferencias',
    query: { status: 'open', receipt: 'received_with_differences' },
  },
  stageToReceive: { label: 'Etapa · Por recibir', query: { status: 'open', stage: 'to_receive' } },
  stageToInvoice: {
    label: 'Etapa · Lista para factura',
    query: { status: 'open', stage: 'to_invoice' },
  },
  stageInReview: {
    label: 'Etapa · Factura en revisión',
    query: { status: 'open', stage: 'in_review' },
  },
  stageToSchedule: {
    label: 'Etapa · Por programar',
    query: { status: 'open', stage: 'to_schedule' },
  },
  stageScheduled: {
    label: 'Etapa · Pago programado',
    query: { status: 'open', stage: 'scheduled' },
  },
  stagePaid: { label: 'Etapa · Pagada', query: { status: 'open', stage: 'paid' } },
  cancelled: { label: 'Canceladas', query: { status: 'cancelled' } },
  all: { label: 'Todas', query: { status: 'all' } },
} satisfies Record<string, { label: string; query: Partial<PurchaseOrderListQuery> }>;
type View = keyof typeof VIEWS;

const STAGE_TONE: Record<PoStage, DotTone> = {
  cancelled: 'neutral',
  to_receive: 'warning',
  to_invoice: 'primary',
  in_review: 'primary',
  to_schedule: 'primary',
  scheduled: 'primary',
  paid: 'success',
};

/** Etapa de la orden (spec 019): punto + texto; si se recibió con diferencias, lo dice debajo (spec 018). */
function Stage({ order }: { order: PurchaseOrderDto }) {
  const { stage } = order.progress;
  return (
    <Box>
      <StatusDot tone={STAGE_TONE[stage]}>{PO_STAGE_LABELS[stage]}</StatusDot>
      {order.receiptStatus === 'received_with_differences' && (
        <Typography
          variant="caption"
          component="div"
          sx={{ color: 'warning.dark', pl: 1.75, lineHeight: 1.2, fontWeight: 600 }}
        >
          Recibida con diferencias
        </Typography>
      )}
    </Box>
  );
}

function OrderActions(props: { order: PurchaseOrderDto; onOpen: (dialog: Dialog) => void }) {
  const { order } = props;
  const can = useCan();
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
      {can('orders:write') && (
        <Button size="small" color="inherit" onClick={() => props.onOpen({ kind: 'edit', order })}>
          Editar
        </Button>
      )}
    </Stack>
  );
}

export function PurchaseOrdersPage() {
  const canWrite = useCan()('orders:write');
  const [search, setSearch] = useState('');
  // «Ver todas» de Mi trabajo llega con la vista en la URL (spec 017).
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const wanted = params.get('view');
    return wanted && Object.hasOwn(VIEWS, wanted) ? (wanted as View) : 'open';
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const orders = usePurchaseOrders({ search: useDeferredValue(search), ...VIEWS[view].query });
  // La columna Estado solo informa cuando la vista mezcla abiertas y canceladas.
  const showStatus = view === 'all';

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        actions={
          canWrite && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setDialog({ kind: 'edit' })}
            >
              Nueva orden
            </Button>
          )
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
            <TableCell align="right">Partidas</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell>Etapa</TableCell>
            {showStatus && <TableCell>Estado</TableCell>}
            <TableCell align="right" />
          </TableRow>
        }
        row={(order) => (
          <DataRow
            key={order.id}
            to={`/ordenes/${order.id}`}
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
            <TableCell align="right">{order.lines.length || '—'}</TableCell>
            <TableCell align="right">
              <Money amount={order.total} currency={order.currency} />
            </TableCell>
            <TableCell sx={{ py: 0.5 }}>
              <Stage order={order} />
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
              <CardField label="Partidas">{order.lines.length || '—'}</CardField>
              <CardField label="Etapa">
                <Stage order={order} />
              </CardField>
              {showStatus && (
                <CardField label="Estado">{PURCHASE_ORDER_STATUS_LABELS[order.status]}</CardField>
              )}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button size="small" component={RouterLink} to={`/ordenes/${order.id}`}>
                Abrir
              </Button>
              <OrderActions order={order} onOpen={setDialog} />
            </Stack>
          </Stack>
        )}
      />

      {dialog?.kind === 'edit' && (
        <PurchaseOrderDialog order={dialog.order} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

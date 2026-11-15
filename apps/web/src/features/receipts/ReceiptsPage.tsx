import type { ReceiptOrderDto } from '@mimark/contracts/receipts';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useDeferredValue, useState } from 'react';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { formatDay } from '../../lib/format';
import { ReceiptDialog } from './ReceiptDialog';
import { useReceipts } from './receipts.api';

type Status = 'pending' | 'received';

/** Recepciones (spec 017): lo que Almacén necesita para recibir una orden, sin precios ni totales. */
export function ReceiptsPage() {
  const [status, setStatus] = useState<Status>('pending');
  const [search, setSearch] = useState('');
  const [receiving, setReceiving] = useState<ReceiptOrderDto | null>(null);
  const receipts = useReceipts({ status, search: useDeferredValue(search) });
  const pending = status === 'pending';

  const action = (order: ReceiptOrderDto) =>
    pending ? (
      <Button size="small" onClick={() => setReceiving(order)}>
        Recibir
      </Button>
    ) : null;

  return (
    <>
      <PageHeader title="Recepciones" />

      <Tabs
        value={status}
        onChange={(_, value: Status) => setStatus(value)}
        aria-label="Estado de la recepción"
        sx={{ mb: 2 }}
      >
        <Tab value="pending" label="Por recibir" />
        <Tab value="received" label="Recibidas" />
      </Tabs>

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
        sx={{ mb: 2, width: '100%', maxWidth: { md: 360 } }}
      />

      <ErrorAlert error={receipts.error} />
      <DataTable
        aria-label="Órdenes de compra"
        items={receipts.data?.items}
        loading={receipts.isFetching}
        getKey={(order) => order.id}
        empty={pending ? 'No hay órdenes por recibir.' : 'Todavía no hay órdenes recibidas.'}
        head={
          <TableRow>
            <TableCell>Folio</TableCell>
            <TableCell>Proveedor</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Partidas</TableCell>
            <TableCell align="right" />
          </TableRow>
        }
        row={(order) => (
          <DataRow key={order.id} label={`${order.number} ${order.supplierName}`}>
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
              <Ellipsis maxWidth={320}>{order.supplierName}</Ellipsis>
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>
              {formatDay(order.receivedOn ?? order.issuedOn)}
            </TableCell>
            <TableCell align="right">{order.lines.length || '—'}</TableCell>
            <TableCell align="right">{action(order)}</TableCell>
          </DataRow>
        )}
        card={(order) => (
          <Stack spacing={1.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: MONO, fontWeight: 500 }}>{order.number}</Typography>
              <Typography variant="body2" color="text.secondary">
                {order.supplierName}
              </Typography>
            </Box>
            <Stack direction="row" spacing={3}>
              <CardField label={pending ? 'Fecha' : 'Recibida'}>
                {formatDay(order.receivedOn ?? order.issuedOn)}
              </CardField>
              <CardField label="Partidas">{order.lines.length || '—'}</CardField>
            </Stack>
            {action(order)}
          </Stack>
        )}
      />

      {receiving && <ReceiptDialog order={receiving} onClose={() => setReceiving(null)} />}
    </>
  );
}

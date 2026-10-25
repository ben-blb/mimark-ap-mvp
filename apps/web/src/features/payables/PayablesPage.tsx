import type { PayableListQuery } from '@mimark/contracts/payables';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
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
import { Link as RouterLink } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatMoney } from '../../lib/format';
import { usePayables } from './payables.api';
import { UploadDialog } from './UploadDialog';

type Status = NonNullable<PayableListQuery['status']> | 'all';

const STATUS_FILTERS: { value: Status; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_confirmation', label: 'Por confirmar' },
  { value: 'requires_review', label: 'En revisión' },
  { value: 'out_of_scope', label: 'Fuera de alcance' },
  { value: 'failed', label: 'Con error' },
];

export function PayablesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [uploading, setUploading] = useState(false);
  const payables = usePayables({
    search: useDeferredValue(search),
    status: status === 'all' ? undefined : status,
  });

  return (
    <>
      <PageHeader
        title="Expedientes"
        subtitle="Cada documento de proveedor se lee, se valida contra su orden de compra y espera tu confirmación."
        actions={
          <Button variant="contained" onClick={() => setUploading(true)}>
            Subir documento
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por proveedor, factura, OC o archivo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { md: 360 } }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          aria-label="Estado"
          value={status}
          onChange={(_, value: Status | null) => value && setStatus(value)}
        >
          {STATUS_FILTERS.map((f) => (
            <ToggleButton key={f.value} value={f.value}>
              {f.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <ErrorAlert error={payables.error} />
      <TableContainer component={Paper}>
        {payables.isFetching && <LinearProgress />}
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Recibido</TableCell>
              <TableCell>Archivo</TableCell>
              <TableCell>Proveedor</TableCell>
              <TableCell>Factura</TableCell>
              <TableCell>OC</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payables.data?.items.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell>{formatDateTime(p.createdAt)}</TableCell>
                <TableCell>
                  <Link component={RouterLink} to={`/expedientes/${p.id}`}>
                    {p.fileName}
                  </Link>
                </TableCell>
                <TableCell>{p.supplierName ?? '—'}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{p.invoiceNumber ?? '—'}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{p.poNumber ?? '—'}</TableCell>
                <TableCell align="right">
                  {p.total && p.currency ? formatMoney(p.total, p.currency) : '—'}
                </TableCell>
                <TableCell>
                  <StatusChip status={p.status} />
                </TableCell>
              </TableRow>
            ))}
            {payables.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No hay expedientes con este filtro. Sube uno con «Subir documento».
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}

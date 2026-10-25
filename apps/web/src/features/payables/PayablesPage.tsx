import type { PayableListFilters } from '@mimark/contracts/payables';
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
import { Link as RouterLink, useSearchParams } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { StatusChip } from '../../components/StatusChip';
import { formatDateTime, formatMoney } from '../../lib/format';
import { useSuppliers } from '../suppliers/suppliers.api';
import { usePayables } from './payables.api';
import { UploadDialog } from './UploadDialog';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'pending_confirmation', label: 'Por confirmar' },
  { value: 'requires_review', label: 'En revisión' },
  { value: 'requires_review,pending_confirmation', label: 'Por revisar' },
  { value: 'confirmed,scheduled', label: 'Por pagar' },
  { value: 'out_of_scope', label: 'Fuera de alcance' },
  { value: 'failed', label: 'Con error' },
];

const DUE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Cualquiera' },
  { value: 'overdue', label: 'Vencidos' },
  { value: '7', label: '7 días' },
  { value: '15', label: '15 días' },
  { value: '30', label: '30 días' },
];

/** Los filtros viven en la URL: así los enlaces del tablero (y recargar la página) los conservan. */
type FilterKey = 'status' | 'search' | 'supplierId' | 'poNumber' | 'invoiceNumber' | 'due';

export function PayablesPage() {
  const [params, setParams] = useSearchParams();
  const [uploading, setUploading] = useState(false);
  const suppliers = useSuppliers({ status: 'all' });
  const get = (key: FilterKey) => params.get(key) ?? '';
  const set = (key: FilterKey, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const search = useDeferredValue(get('search'));
  const poNumber = useDeferredValue(get('poNumber'));
  const invoiceNumber = useDeferredValue(get('invoiceNumber'));
  const payables = usePayables({
    status: get('status') || undefined,
    search,
    supplierId: get('supplierId') || undefined,
    poNumber,
    invoiceNumber,
    due: (get('due') || undefined) as PayableListFilters['due'],
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

      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Buscar por proveedor, factura, OC o archivo"
            value={get('search')}
            onChange={(e) => set('search', e.target.value)}
            sx={{ minWidth: { md: 360 } }}
          />
          <TextField
            select
            label="Proveedor"
            value={get('supplierId')}
            onChange={(e) => set('supplierId', e.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: { md: 240 } }}
          >
            <option value="">Todos</option>
            {suppliers.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </TextField>
          <TextField
            label="Orden de compra"
            value={get('poNumber')}
            onChange={(e) => set('poNumber', e.target.value)}
          />
          <TextField
            label="Factura"
            value={get('invoiceNumber')}
            onChange={(e) => set('invoiceNumber', e.target.value)}
          />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <ToggleButtonGroup
            size="small"
            exclusive
            aria-label="Estado"
            value={get('status')}
            onChange={(_, value: string | null) => value !== null && set('status', value)}
          >
            {STATUS_FILTERS.map((f) => (
              <ToggleButton key={f.value} value={f.value}>
                {f.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <ToggleButtonGroup
            size="small"
            exclusive
            aria-label="Vencimiento"
            value={get('due')}
            onChange={(_, value: string | null) => value !== null && set('due', value)}
          >
            {DUE_FILTERS.map((f) => (
              <ToggleButton key={f.value} value={f.value}>
                {f.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
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

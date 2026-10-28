import type { PayableListFilters } from '@mimark/contracts/payables';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useDeferredValue, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { ResponsiveList } from '../../components/ResponsiveList';
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

  const [moreFilters, setMoreFilters] = useState(
    Boolean(get('supplierId') || get('poNumber') || get('invoiceNumber')),
  );

  return (
    <>
      <PageHeader
        title="Expedientes"
        subtitle="Cada documento de proveedor se lee, se valida contra su orden de compra y espera tu confirmación."
        actions={
          <Button
            variant="contained"
            startIcon={<UploadFileOutlined />}
            onClick={() => setUploading(true)}
          >
            Subir documento
          </Button>
        }
      />

      <Stack spacing={1.5} sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            placeholder="Buscar por proveedor, factura, OC o archivo"
            value={get('search')}
            onChange={(e) => set('search', e.target.value)}
            slotProps={{
              htmlInput: { 'aria-label': 'Buscar por proveedor, factura, OC o archivo' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ maxWidth: { md: 480 } }}
          />
          <Button
            variant="outlined"
            startIcon={<TuneOutlined />}
            aria-expanded={moreFilters}
            onClick={() => setMoreFilters((open) => !open)}
            sx={{ flexShrink: 0 }}
          >
            Filtros
          </Button>
        </Stack>
        <Collapse in={moreFilters}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ pt: 0.5 }}>
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
        </Collapse>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
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
      <ResponsiveList
        aria-label="Expedientes"
        items={payables.data?.items}
        loading={payables.isFetching}
        getKey={(p) => p.id}
        empty="No hay expedientes con este filtro. Sube uno con «Subir documento»."
        head={
          <TableRow>
            <TableCell>Recibido</TableCell>
            <TableCell>Archivo</TableCell>
            <TableCell>Proveedor</TableCell>
            <TableCell>Factura</TableCell>
            <TableCell>OC</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell>Estado</TableCell>
          </TableRow>
        }
        row={(p) => (
          <TableRow key={p.id} hover>
            <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
              {formatDateTime(p.createdAt)}
            </TableCell>
            <TableCell sx={{ minWidth: 180, maxWidth: 260, overflowWrap: 'anywhere' }}>
              <Link component={RouterLink} to={`/expedientes/${p.id}`} sx={{ fontWeight: 600 }}>
                {p.fileName}
              </Link>
            </TableCell>
            <TableCell sx={{ maxWidth: 280 }}>
              <Box
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
                title={p.supplierName ?? undefined}
              >
                {p.supplierName ?? '—'}
              </Box>
            </TableCell>
            <TableCell sx={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>
              {p.invoiceNumber ?? '—'}
            </TableCell>
            <TableCell sx={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>
              {p.poNumber ?? '—'}
            </TableCell>
            <TableCell
              align="right"
              sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {p.total && p.currency ? formatMoney(p.total, p.currency) : '—'}
            </TableCell>
            <TableCell>
              <StatusChip status={p.status} />
            </TableCell>
          </TableRow>
        )}
        card={(p) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Link
                  component={RouterLink}
                  to={`/expedientes/${p.id}`}
                  sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
                >
                  {p.fileName}
                </Link>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {p.supplierName ?? '—'}
                </Typography>
              </Box>
              <StatusChip status={p.status} />
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <CardField label="Factura">{p.invoiceNumber ?? '—'}</CardField>
              <CardField label="OC">{p.poNumber ?? '—'}</CardField>
              <CardField label="Total">
                {p.total && p.currency ? formatMoney(p.total, p.currency) : '—'}
              </CardField>
              <CardField label="Recibido">{formatDateTime(p.createdAt)}</CardField>
            </Box>
          </Stack>
        )}
      />

      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}

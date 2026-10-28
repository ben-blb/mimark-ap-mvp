import type { SupplierDto, SupplierListQuery } from '@mimark/contracts/suppliers';
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
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { StatusDot } from '../../components/StatusDot';
import { paymentTermLabel } from '../../lib/format';
import { SupplierDialog } from './SupplierDialog';
import { useSuppliers } from './suppliers.api';

type Status = SupplierListQuery['status'];

function Active({ active }: { active: boolean }) {
  return (
    <StatusDot tone={active ? 'success' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</StatusDot>
  );
}

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [editing, setEditing] = useState<SupplierDto | 'new' | null>(null);
  const suppliers = useSuppliers({ search: useDeferredValue(search), status });

  return (
    <>
      <PageHeader
        title="Proveedores"
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing('new')}>
            Nuevo proveedor
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          placeholder="Buscar por nombre o RFC"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Buscar por nombre o RFC' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ maxWidth: { sm: 360 } }}
        />
        <TextField
          select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          slotProps={{ select: { native: true }, htmlInput: { 'aria-label': 'Estado' } }}
          sx={{ width: { sm: 180 }, flexShrink: 0 }}
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </TextField>
      </Stack>

      <ErrorAlert error={suppliers.error} />
      <DataTable
        aria-label="Proveedores"
        items={suppliers.data?.items}
        loading={suppliers.isFetching}
        getKey={(supplier) => supplier.id}
        empty="No hay proveedores con este filtro. Registra uno con «Nuevo proveedor»."
        head={
          <TableRow>
            <TableCell>Razón social</TableCell>
            <TableCell>RFC</TableCell>
            <TableCell>Condición</TableCell>
            <TableCell>Moneda</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right" />
          </TableRow>
        }
        row={(supplier) => (
          <DataRow key={supplier.id} onOpen={() => setEditing(supplier)} label={supplier.name}>
            <TableCell sx={{ minWidth: 240 }}>
              <Ellipsis maxWidth={360}>{supplier.name}</Ellipsis>
            </TableCell>
            <TableCell sx={{ fontFamily: MONO, fontSize: '0.8125rem' }}>{supplier.taxId}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>
              {paymentTermLabel(supplier.creditDays)}
            </TableCell>
            <TableCell>{supplier.currency}</TableCell>
            <TableCell>
              <Active active={supplier.active} />
            </TableCell>
            <TableCell align="right">
              <Button size="small" color="inherit" onClick={() => setEditing(supplier)}>
                Editar
              </Button>
            </TableCell>
          </DataRow>
        )}
        card={(supplier) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500 }}>{supplier.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: MONO }}>
                  {supplier.taxId}
                </Typography>
              </Box>
              <Active active={supplier.active} />
            </Stack>
            <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-end' }}>
              <CardField label="Condición">{paymentTermLabel(supplier.creditDays)}</CardField>
              <CardField label="Moneda">{supplier.currency}</CardField>
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" onClick={() => setEditing(supplier)}>
                Editar
              </Button>
            </Stack>
          </Stack>
        )}
      />

      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

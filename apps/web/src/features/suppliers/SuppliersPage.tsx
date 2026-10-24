import type { SupplierDto, SupplierListQuery } from '@mimark/contracts/suppliers';
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
import { paymentTermLabel } from '../../lib/format';
import { SupplierDialog } from './SupplierDialog';
import { useSuppliers } from './suppliers.api';

type Status = SupplierListQuery['status'];

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [editing, setEditing] = useState<SupplierDto | 'new' | null>(null);
  const suppliers = useSuppliers({ search: useDeferredValue(search), status });

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="Condiciones de pago con las que se calcula el vencimiento de cada factura."
        actions={
          <Button variant="contained" onClick={() => setEditing('new')}>
            Nuevo proveedor
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por nombre o RFC"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ maxWidth: { sm: 360 } }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={status}
          onChange={(_, value: Status | null) => value && setStatus(value)}
        >
          <ToggleButton value="active">Activos</ToggleButton>
          <ToggleButton value="inactive">Inactivos</ToggleButton>
          <ToggleButton value="all">Todos</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <ErrorAlert error={suppliers.error} />
      <TableContainer component={Paper}>
        {suppliers.isFetching && <LinearProgress />}
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Razón social</TableCell>
              <TableCell>RFC</TableCell>
              <TableCell>Condición</TableCell>
              <TableCell>Moneda</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {suppliers.data?.items.map((supplier) => (
              <TableRow key={supplier.id} hover>
                <TableCell>{supplier.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{supplier.taxId}</TableCell>
                <TableCell>{paymentTermLabel(supplier.creditDays)}</TableCell>
                <TableCell>{supplier.currency}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={supplier.active ? 'Activo' : 'Inactivo'}
                    color={supplier.active ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setEditing(supplier)}>
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {suppliers.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No hay proveedores con este filtro. Registra uno con «Nuevo proveedor».
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

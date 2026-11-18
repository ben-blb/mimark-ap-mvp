import AddOutlined from '@mui/icons-material/AddOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { type ReactNode, useState } from 'react';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { StatusDot } from '../../components/StatusDot';
import { CatalogForm, type CatalogField } from './CatalogForm';
import { type CatalogResource, useSaveCatalogItem } from './closing.api';

export type Row = { id: string; active: boolean };

/** Lo que cada pestaña necesita saber para listar, crear y editar un recurso. */
export interface TabDef<T extends Row> {
  resource: CatalogResource;
  label: string;
  /** «Agregar empresa», «Agregar kiosko»... */
  add: string;
  query: { data?: { items: T[] }; error: unknown; isFetching: boolean };
  columns: { label: string; cell: (item: T) => ReactNode }[];
  createSchema: Parameters<typeof CatalogForm>[0]['schema'];
  updateSchema: Parameters<typeof CatalogForm>[0]['schema'];
  fields: CatalogField[];
  /** Valores iniciales de un alta. */
  blank: Record<string, unknown>;
  /** Valores de la edición a partir del registro. */
  toForm: (item: T) => Record<string, unknown>;
  title: (item: T) => string;
}

const Active = ({ active }: { active: boolean }) => (
  <StatusDot tone={active ? 'success' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</StatusDot>
);

function ItemDialog<T extends Row>({
  def,
  item,
  onClose,
}: {
  def: TabDef<T>;
  item?: T;
  onClose: () => void;
}) {
  const save = useSaveCatalogItem(def.resource, item?.id);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{item ? `Editar: ${def.title(item)}` : def.add}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <CatalogForm
          schema={item ? def.updateSchema : def.createSchema}
          fields={def.fields}
          initial={item ? def.toForm(item) : def.blank}
          editing={Boolean(item)}
          pending={save.isPending}
          error={save.error}
          onSubmit={(values) => save.mutate(values, { onSuccess: onClose })}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CatalogTab<T extends Row>({
  def,
  canWrite,
}: {
  def: TabDef<T>;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  return (
    <>
      {canWrite && (
        <Box sx={{ mb: 2 }}>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing('new')}>
            {def.add}
          </Button>
        </Box>
      )}
      <ErrorAlert error={def.query.error} />
      <DataTable
        aria-label={def.label}
        items={def.query.data?.items}
        loading={def.query.isFetching}
        getKey={(item) => item.id}
        empty={`Aún no hay ${def.label.toLowerCase()}.`}
        head={
          <TableRow>
            {def.columns.map((c) => (
              <TableCell key={c.label}>{c.label}</TableCell>
            ))}
            <TableCell>Estado</TableCell>
            <TableCell align="right" />
          </TableRow>
        }
        row={(item) => (
          <DataRow
            key={item.id}
            label={def.title(item)}
            onOpen={canWrite ? () => setEditing(item) : undefined}
          >
            {def.columns.map((c) => (
              <TableCell key={c.label}>{c.cell(item)}</TableCell>
            ))}
            <TableCell>
              <Active active={item.active} />
            </TableCell>
            <TableCell align="right">
              {canWrite && (
                <Button size="small" color="inherit" onClick={() => setEditing(item)}>
                  Editar
                </Button>
              )}
            </TableCell>
          </DataRow>
        )}
        card={(item) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 500 }}>{def.title(item)}</Typography>
              <Active active={item.active} />
            </Stack>
            <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {def.columns.slice(1).map((c) => (
                <CardField key={c.label} label={c.label}>
                  {c.cell(item)}
                </CardField>
              ))}
              <Box sx={{ flexGrow: 1 }} />
              {canWrite && (
                <Button size="small" onClick={() => setEditing(item)}>
                  Editar
                </Button>
              )}
            </Stack>
          </Stack>
        )}
      />
      {editing && (
        <ItemDialog
          def={def}
          item={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

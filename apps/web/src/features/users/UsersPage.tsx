import type { UserDto } from '@mimark/contracts/users';
import AddOutlined from '@mui/icons-material/AddOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { StatusDot } from '../../components/StatusDot';
import { ROLE_LABELS } from '../../lib/labels';
import { useSession } from '../session/session.api';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';
import { UserDialog } from './UserDialog';
import { useDeactivateUser, useResetPassword, useUsers } from './users.api';

function Active({ active }: { active: boolean }) {
  return (
    <StatusDot tone={active ? 'success' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</StatusDot>
  );
}

/** Solo administración (spec 013): alta, edición, baja y restablecer contraseña. */
export function UsersPage() {
  const me = useSession().data;
  const users = useUsers();
  const deactivate = useDeactivateUser();
  const reset = useResetPassword();
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<UserDto | null>(null);
  const [temporary, setTemporary] = useState<{ name: string; password: string } | null>(null);

  function resetPassword(user: UserDto) {
    reset.mutate(user.id, {
      onSuccess: ({ temporaryPassword }) =>
        setTemporary({ name: user.name, password: temporaryPassword }),
    });
  }

  const actions = (user: UserDto) => (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
      <Button size="small" color="inherit" onClick={() => setEditing(user)}>
        Editar
      </Button>
      <Button size="small" color="inherit" onClick={() => resetPassword(user)}>
        Restablecer contraseña
      </Button>
      {user.active && user.id !== me?.userId && (
        <Button size="small" color="error" onClick={() => setRemoving(user)}>
          Desactivar
        </Button>
      )}
    </Stack>
  );

  return (
    <>
      <PageHeader
        title="Usuarios"
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing('new')}>
            Nuevo usuario
          </Button>
        }
      />
      <ErrorAlert error={users.error ?? reset.error ?? deactivate.error} />
      <DataTable
        aria-label="Usuarios"
        items={users.data?.items}
        loading={users.isFetching}
        getKey={(user) => user.id}
        empty="No hay usuarios."
        head={
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Correo</TableCell>
            <TableCell>Rol</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right" />
          </TableRow>
        }
        row={(user) => (
          <DataRow key={user.id} label={user.name}>
            <TableCell sx={{ minWidth: 180 }}>
              <Ellipsis maxWidth={280}>{user.name}</Ellipsis>
            </TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{ROLE_LABELS[user.role]}</TableCell>
            <TableCell>
              <Active active={user.active} />
            </TableCell>
            <TableCell align="right">{actions(user)}</TableCell>
          </DataRow>
        )}
        card={(user) => (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500 }}>{user.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              </Box>
              <Active active={user.active} />
            </Stack>
            <CardField label="Rol">{ROLE_LABELS[user.role]}</CardField>
            {actions(user)}
          </Stack>
        )}
      />

      {editing && (
        <UserDialog
          user={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <Dialog open onClose={() => setRemoving(null)}>
          <DialogTitle>Desactivar a {removing.name}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Ya no podrá entrar. Su historial se conserva. Si tiene una sesión abierta, termina
              cuando venza (máximo 8 horas).
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button
              color="error"
              variant="contained"
              loading={deactivate.isPending}
              onClick={() => deactivate.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            >
              Desactivar
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {temporary && (
        <TemporaryPasswordDialog
          name={temporary.name}
          password={temporary.password}
          onClose={() => setTemporary(null)}
        />
      )}
    </>
  );
}

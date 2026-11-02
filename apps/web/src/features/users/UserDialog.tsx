import type { UserDto } from '@mimark/contracts/users';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { UserForm, type UserFormValues } from './UserForm';
import { useCreateUser, useUpdateUser } from './users.api';

/** Conecta el formulario con la API: alta si no hay `user`, edición si lo hay. */
export function UserDialog({ user, onClose }: { user?: UserDto; onClose: () => void }) {
  const create = useCreateUser();
  const update = useUpdateUser(user?.id ?? '');
  const mutation = user ? update : create;

  function submit(values: UserFormValues) {
    if (user) {
      update.mutate(
        { name: values.name, role: values.role, active: values.active },
        { onSuccess: onClose },
      );
    } else {
      const { active: _active, ...data } = values;
      create.mutate(data, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{user ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <UserForm
          user={user}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

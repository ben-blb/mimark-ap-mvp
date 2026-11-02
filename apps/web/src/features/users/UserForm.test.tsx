import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { UserForm } from './UserForm';

function setup(props: Partial<Parameters<typeof UserForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <UserForm pending={false} error={null} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('UserForm', () => {
  it('AC-013-10 rechaza una contraseña temporal de menos de 10 caracteres', async () => {
    const { onSubmit, user } = setup();

    await user.type(screen.getByLabelText('Nombre'), 'Carla Compras');
    await user.type(screen.getByLabelText('Correo'), 'carla@mimark.mx');
    await user.type(screen.getByLabelText('Contraseña temporal'), '123456789');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-013-18 envía el alta con el correo normalizado y el rol elegido', async () => {
    const { onSubmit, user } = setup();

    await user.type(screen.getByLabelText('Nombre'), 'Carla Compras');
    await user.type(screen.getByLabelText('Correo'), 'Carla@Mimark.MX');
    await user.selectOptions(screen.getByLabelText('Rol'), 'warehouse');
    await user.type(screen.getByLabelText('Contraseña temporal'), 'temporal-larga-1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Carla Compras',
        email: 'carla@mimark.mx',
        role: 'warehouse',
        password: 'temporal-larga-1',
      }),
    );
  });

  it('AC-013-18 muestra el error de correo repetido que devuelve la API', () => {
    const error = new ApiError(409, 'EMAIL_TAKEN', 'Ya existe un usuario con ese correo.', 'r1', {
      email: 'Ya existe un usuario con ese correo',
    });
    setup({ error });
    expect(screen.getByText('Ya existe un usuario con ese correo')).toBeInTheDocument();
  });

  it('AC-013-20 al editar no pide contraseña, deja el correo fijo y envía rol y estado', async () => {
    const { onSubmit, user } = setup({
      user: {
        id: 'u1',
        name: 'Beto',
        email: 'beto@mimark.mx',
        role: 'warehouse',
        active: true,
        mustChangePassword: false,
        createdAt: '2026-11-02T00:00:00.000Z',
      },
    });

    expect(screen.queryByLabelText('Contraseña temporal')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Rol'), 'manager');
    await user.click(screen.getByRole('switch', { name: 'Activo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Beto', role: 'manager', active: false }),
    );
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './ChangePasswordForm';

function setup() {
  const onSubmit = vi.fn();
  render(<ChangePasswordForm pending={false} error={null} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('ChangePasswordForm', () => {
  it('AC-013-10 rechaza una contraseña nueva de menos de 10 caracteres', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Contraseña actual'), 'temporal');
    await user.type(screen.getByLabelText('Contraseña nueva'), '123456789');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), '123456789');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(screen.getByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-013-12 exige repetir la contraseña y envía solo la actual y la nueva', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Contraseña actual'), 'temporal-larga-1');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nueva-contrasena-1');
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'otra-cosa-distinta');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Repite la contraseña nueva'));
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), 'nueva-contrasena-1');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(onSubmit).toHaveBeenCalledWith({
      currentPassword: 'temporal-larga-1',
      newPassword: 'nueva-contrasena-1',
    });
  });
});

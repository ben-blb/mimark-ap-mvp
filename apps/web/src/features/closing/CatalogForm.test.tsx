import { CreateRuleInput } from '@mimark/contracts/closing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client';
import { CatalogForm } from './CatalogForm';

const fields = [
  { name: 'pattern', label: 'Patrón' },
  { name: 'categoryId', label: 'Categoría', options: [{ value: 'c1', label: 'Seguridad' }] },
  { name: 'priority', label: 'Prioridad', type: 'number' as const },
];

function setup(error: unknown = null) {
  const onSubmit = vi.fn();
  render(
    <CatalogForm
      schema={CreateRuleInput}
      fields={fields}
      initial={{ pattern: '', categoryId: 'c1', priority: '0' }}
      pending={false}
      error={error}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('CatalogForm', () => {
  it('AC-020-12 valida con el esquema de contracts: patrón de menos de 3 caracteres', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Patrón'), 'ab');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Escribe al menos 3 caracteres')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-020-12 envía los valores ya validados', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Patrón'), 'ADT SECURITY');
    await user.clear(screen.getByLabelText('Prioridad'));
    await user.type(screen.getByLabelText('Prioridad'), '10');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith({
      pattern: 'ADT SECURITY',
      categoryId: 'c1',
      priority: 10,
    });
  });

  it('AC-020-12 muestra en su campo el error que devolvió la API', () => {
    setup(new ApiError(409, 'CONFLICT', 'Duplicado', 'req-1', { pattern: 'Ya existe esa regla' }));
    expect(screen.getByText('Ya existe esa regla')).toBeInTheDocument();
  });
});

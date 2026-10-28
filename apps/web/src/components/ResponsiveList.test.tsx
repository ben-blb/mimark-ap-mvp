import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setViewport } from '../test/setup';
import { ResponsiveList } from './ResponsiveList';

const items = [
  { id: 'a', name: 'Distribuidora del Norte' },
  { id: 'b', name: 'Papelera Sur' },
];

function setup(width: number, list = items) {
  setViewport(width);
  render(
    <ResponsiveList
      aria-label="Proveedores"
      items={list}
      getKey={(i) => i.id}
      empty="No hay proveedores."
      head={
        <TableRow>
          <TableCell>Nombre</TableCell>
        </TableRow>
      }
      row={(i) => (
        <TableRow key={i.id}>
          <TableCell>{i.name}</TableCell>
        </TableRow>
      )}
      card={(i) => <span>{i.name}</span>}
    />,
  );
}

describe('ResponsiveList', () => {
  it('AC-009-04 en escritorio es una tabla con cabecera', () => {
    setup(1440);
    expect(screen.getByRole('table', { name: 'Proveedores' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
  });

  it('AC-009-04 en el teléfono es una lista de tarjetas con los mismos datos', () => {
    setup(375);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Proveedores' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Papelera Sur')).toBeInTheDocument();
  });

  it('AC-009-04 sin elementos muestra el mensaje en ambos tamaños', () => {
    setup(375, []);
    expect(screen.getByText('No hay proveedores.')).toBeInTheDocument();
  });
});

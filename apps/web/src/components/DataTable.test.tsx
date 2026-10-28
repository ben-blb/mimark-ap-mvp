import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setViewport } from '../test/setup';
import { DataRow, DataTable } from './DataTable';

const items = [
  { id: 'a', name: 'Distribuidora del Norte' },
  { id: 'b', name: 'Papelera Sur' },
];

function setup(width: number, list = items) {
  setViewport(width);
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <DataTable
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
                <DataRow key={i.id} to={`/p/${i.id}`} label={i.name}>
                  <TableCell>
                    {i.name} <button type="button">Editar</button>
                  </TableCell>
                </DataRow>
              )}
              card={(i) => <span>{i.name}</span>}
            />
          }
        />
        <Route path="/p/:id" element={<p>detalle</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('DataTable', () => {
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

  it('AC-009-04 sin elementos muestra el mensaje', () => {
    setup(375, []);
    expect(screen.getByText('No hay proveedores.')).toBeInTheDocument();
  });

  it('AC-010-04 la fila se abre con Enter desde el teclado', async () => {
    const user = setup(1440);
    await user.tab();
    expect(screen.getByRole('row', { name: 'Distribuidora del Norte' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('detalle')).toBeInTheDocument();
  });

  it('AC-010-04 la fila se abre con clic, pero sus botones no la abren', async () => {
    const user = setup(1440);
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    expect(screen.queryByText('detalle')).not.toBeInTheDocument();
    await user.click(screen.getByText('Papelera Sur'));
    expect(screen.getByText('detalle')).toBeInTheDocument();
  });
});

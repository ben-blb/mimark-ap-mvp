import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableCell from '@mui/material/TableCell';
import TableSortLabel from '@mui/material/TableSortLabel';
import type { ReactNode } from 'react';
import { useState } from 'react';

/**
 * Tabla de reporte (AC-024-19): conserva sus columnas a cualquier ancho y se desplaza dentro de su contenedor,
 * sin desbordar la página. Un reporte es para comparar cifras, así que no se convierte en tarjetas.
 */
export function ReportTable(props: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
      <Table aria-label={props.label} size="small" sx={{ minWidth: 560 }}>
        {props.children}
      </Table>
    </Box>
  );
}

export const NUMERIC = { textAlign: 'right' } as const;

export type SortState<K extends string> = { key: K; direction: 'asc' | 'desc' };

/** Orden de una columna: un clic ordena de mayor a menor, otro de menor a mayor. */
export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState(initial);
  const toggle = (key: K) =>
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'desc' ? 'asc' : 'desc' }));
  return { sort, toggle };
}

export function SortHeader<K extends string>(props: {
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  numeric?: boolean;
  children: ReactNode;
}) {
  const active = props.sort.key === props.column;
  return (
    <TableCell
      sx={props.numeric ? NUMERIC : undefined}
      aria-sort={active ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <TableSortLabel
        active={active}
        direction={active ? props.sort.direction : 'desc'}
        onClick={() => props.onSort(props.column)}
      >
        {props.children}
      </TableSortLabel>
    </TableCell>
  );
}

/** Compara importes en texto como números (los reportes traen texto con 2 decimales). */
export function compareBy<T>(pick: (item: T) => string | number | null, direction: 'asc' | 'desc') {
  return (a: T, b: T) => {
    const x = pick(a);
    const y = pick(b);
    const order =
      typeof x === 'string' && typeof y === 'string' && Number.isNaN(Number(x))
        ? x.localeCompare(y, 'es')
        : Number(x ?? -Infinity) - Number(y ?? -Infinity);
    return direction === 'asc' ? order : -order;
  };
}

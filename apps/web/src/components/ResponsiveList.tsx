import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Key, ReactNode } from 'react';
import { EmptyState } from './EmptyState';

/**
 * Lista que es tabla en pantallas medianas y grandes y tarjetas en el teléfono (AC-009-04).
 * Cada pantalla da la cabecera, una fila y una tarjeta por elemento; aquí solo se decide cuál se dibuja.
 */
export function ResponsiveList<T>(props: {
  items: T[] | undefined;
  getKey: (item: T) => Key;
  head: ReactNode;
  row: (item: T) => ReactNode;
  card: (item: T) => ReactNode;
  empty: ReactNode;
  loading?: boolean;
  'aria-label'?: string;
}) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const items = props.items ?? [];
  const empty = props.items?.length === 0 && <EmptyState>{props.empty}</EmptyState>;

  if (compact) {
    return (
      <Stack spacing={1.25} component="ul" aria-label={props['aria-label']} sx={{ p: 0, m: 0 }}>
        {props.loading && <LinearProgress />}
        {items.map((item) => (
          <Paper key={props.getKey(item)} component="li" sx={{ listStyle: 'none', p: 2 }}>
            {props.card(item)}
          </Paper>
        ))}
        {empty && (
          <Paper component="li" sx={{ listStyle: 'none' }}>
            {empty}
          </Paper>
        )}
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper}>
      {props.loading && <LinearProgress />}
      <Table aria-label={props['aria-label']}>
        <TableHead>{props.head}</TableHead>
        <TableBody>{items.map((item) => props.row(item))}</TableBody>
      </Table>
      {empty}
    </TableContainer>
  );
}

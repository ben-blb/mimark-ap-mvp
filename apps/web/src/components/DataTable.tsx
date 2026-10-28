import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type Key, type KeyboardEvent, type MouseEvent, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from './EmptyState';

/**
 * Tabla de trabajo única (AC-010-04): compacta, sobre el fondo, con divisores de 1 px y sin tarjeta contenedora.
 * En el teléfono cada elemento es una tarjeta (AC-009-04). Cada pantalla da la cabecera, una fila (`DataRow`) y una
 * tarjeta por elemento; aquí solo se decide cuál se dibuja.
 */
export function DataTable<T>(props: {
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
      <Stack component="ul" aria-label={props['aria-label']} sx={{ p: 0, m: 0 }}>
        {props.loading && <LinearProgress />}
        {items.map((item) => (
          <Box
            key={props.getKey(item)}
            component="li"
            sx={{ listStyle: 'none', py: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            {props.card(item)}
          </Box>
        ))}
        {empty && (
          <Box component="li" sx={{ listStyle: 'none' }}>
            {empty}
          </Box>
        )}
      </Stack>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      {props.loading && <LinearProgress />}
      <Table aria-label={props['aria-label']}>
        <TableHead>{props.head}</TableHead>
        <TableBody>{items.map((item) => props.row(item))}</TableBody>
      </Table>
      {empty}
    </Box>
  );
}

/** Lo que dentro de una fila clicable recibe su propio clic (enlaces, botones, campos). */
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"]';

/**
 * Fila de `DataTable`. Con `to` (o `onOpen`), toda la fila abre su destino con clic o con Enter; los enlaces y
 * botones de la fila siguen funcionando por su cuenta.
 */
export function DataRow(props: {
  to?: string;
  onOpen?: () => void;
  label?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { to, onOpen } = props;
  if (!to && !onOpen) return <TableRow hover>{props.children}</TableRow>;

  const open = (event: MouseEvent | KeyboardEvent) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    if (to) void navigate(to);
    else onOpen?.();
  };
  return (
    <TableRow
      hover
      tabIndex={0}
      aria-label={props.label}
      onClick={open}
      onKeyDown={(event) =>
        event.key === 'Enter' && event.target === event.currentTarget && open(event)
      }
      sx={{ cursor: 'pointer', '&:focus-visible': { outlineOffset: -2 } }}
    >
      {props.children}
    </TableRow>
  );
}

/** Texto en una línea con "…"; si se corta, el texto completo va en un tooltip. */
export function Ellipsis(props: { children: string; maxWidth?: number | string }) {
  const [cut, setCut] = useState(false);
  return (
    <Tooltip title={cut ? props.children : ''} placement="top-start">
      <Box
        component="span"
        onMouseEnter={(e) => setCut(e.currentTarget.scrollWidth > e.currentTarget.clientWidth)}
        sx={{
          display: 'block',
          maxWidth: props.maxWidth ?? 280,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {props.children}
      </Box>
    </Tooltip>
  );
}

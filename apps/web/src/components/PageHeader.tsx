import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Título de página sin subtítulo (DESIGN.md) y, a la derecha, sus acciones. */
export function PageHeader(props: { title: string; actions?: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        mb: { xs: 2.5, sm: 3 },
        minHeight: 32,
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 1.5,
      }}
    >
      <Typography variant="h1">{props.title}</Typography>
      {props.actions && (
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: 'center' }}>
          {props.actions}
        </Stack>
      )}
    </Stack>
  );
}

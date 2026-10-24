import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export function PageHeader(props: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}
    >
      <div>
        <Typography variant="h1">{props.title}</Typography>
        {props.subtitle && (
          <Typography variant="body2" color="text.secondary">
            {props.subtitle}
          </Typography>
        )}
      </div>
      {props.actions}
    </Stack>
  );
}

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export function PageHeader(props: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{
        mb: { xs: 2.5, sm: 4 },
        justifyContent: 'space-between',
        alignItems: { sm: 'flex-end' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1">{props.title}</Typography>
        {props.subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 640 }}>
            {props.subtitle}
          </Typography>
        )}
      </Box>
      {props.actions && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            flexShrink: 0,
            alignItems: 'center',
            '& > .MuiButton-root': { flex: { xs: 1, sm: 'none' } },
          }}
        >
          {props.actions}
        </Stack>
      )}
    </Stack>
  );
}

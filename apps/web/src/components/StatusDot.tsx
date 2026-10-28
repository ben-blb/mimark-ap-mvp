import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

export type DotTone = 'success' | 'warning' | 'error' | 'primary' | 'neutral';

/** Estado como punto de 6 px y texto (DESIGN.md): el color nunca va solo ni como fondo. */
export function StatusDot(props: { tone: DotTone; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: props.tone === 'neutral' ? 'text.tertiary' : `${props.tone}.main`,
        }}
      />
      {props.children}
    </Box>
  );
}

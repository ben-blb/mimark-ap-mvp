import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface SummaryFigure {
  label: string;
  /** La cifra principal (28 px, tabular). */
  value: ReactNode;
  /** Línea pequeña bajo la cifra (conteo, aclaración). */
  note?: ReactNode;
}

/**
 * Franja de resumen (DESIGN.md): cifras separadas por divisores verticales de 1 px, sin tarjetas. En pantallas
 * chicas pasa a dos columnas con divisores horizontales.
 */
export function SummaryStrip(props: { figures: SummaryFigure[]; 'aria-label'?: string }) {
  return (
    <Box
      component="dl"
      aria-label={props['aria-label']}
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          md: `repeat(${props.figures.length}, minmax(0, 1fr))`,
        },
        borderBlock: 1,
        borderColor: 'divider',
      }}
    >
      {props.figures.map((figure, index) => (
        <Box
          key={figure.label}
          sx={{
            py: 2,
            px: { xs: 2, md: 3 },
            pl: { xs: index % 2 === 0 ? 0 : 2, md: index === 0 ? 0 : 3 },
            borderLeft: {
              xs: index % 2 === 0 ? 0 : 1,
              md: index === 0 ? 0 : 1,
            },
            borderTop: { xs: index >= 2 ? 1 : 0, md: 0 },
            borderColor: 'divider',
            minWidth: 0,
          }}
        >
          <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
            {figure.label}
          </Typography>
          <Box component="dd" sx={{ m: 0 }}>
            <Typography
              variant="h3"
              component="div"
              sx={{ mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.75rem' } }}
            >
              {figure.value}
            </Typography>
            {figure.note && (
              <Typography
                variant="caption"
                component="div"
                sx={{ color: 'text.tertiary', mt: 0.5 }}
              >
                {figure.note}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

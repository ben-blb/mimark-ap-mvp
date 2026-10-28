import type { MoneyByCurrency } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { tonal } from '../app/theme';
import { Amounts } from './Amounts';

/** Indicador del tablero: etiqueta, importes por moneda y número de expedientes. */
export function StatCard(props: {
  label: string;
  count: number;
  amount: MoneyByCurrency;
  icon: ReactNode;
  tone?: 'primary' | 'error' | 'warning' | 'success';
}) {
  const tone = props.tone ?? 'primary';
  return (
    <Paper sx={{ p: 2.5, height: '100%' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={(theme) => ({
              ...tonal(theme, tone),
              width: 32,
              height: 32,
              borderRadius: '10px',
              display: 'grid',
              placeItems: 'center',
              '& svg': { fontSize: 18 },
            })}
          >
            {props.icon}
          </Box>
          <Typography
            variant="overline"
            color={tone === 'error' ? 'error' : 'text.secondary'}
            component="h3"
          >
            {props.label}
          </Typography>
        </Stack>
        <Amounts amount={props.amount} />
        <Typography variant="body2" color="text.secondary">
          {props.count} {props.count === 1 ? 'expediente' : 'expedientes'}
        </Typography>
      </Stack>
    </Paper>
  );
}

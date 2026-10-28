import type { DashboardDto } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { vars } from '../../app/theme';
import { ChartDataTable } from './ChartDataTable';

/**
 * Composición de lo por pagar por número de expedientes (AC-009-03): vencidos, próximos (dentro del horizonte)
 * y el resto. Los tres grupos no se traslapan (ver `dashboard.rules.ts`).
 */
export function PortfolioDonut({ data }: { data: DashboardDto }) {
  const theme = useTheme();
  const palette = vars(theme).palette;
  const { pending, overdue, upcoming } = data.totals;
  const later = Math.max(pending.count - overdue.count - upcoming.count, 0);
  const slices = [
    { id: 'overdue', label: 'Vencidos', value: overdue.count, color: palette.error.main },
    {
      id: 'upcoming',
      label: `Dentro de ${data.horizon} días`,
      value: upcoming.count,
      color: palette.warning.main,
    },
    { id: 'later', label: 'Después', value: later, color: palette.primary.main },
  ];

  return (
    <Stack spacing={2} sx={{ position: 'relative', alignItems: 'center' }}>
      <Box aria-hidden sx={{ position: 'relative', width: 180, height: 180 }}>
        <PieChart
          series={[
            {
              data: slices.filter((s) => s.value > 0),
              innerRadius: 62,
              outerRadius: 86,
              paddingAngle: 2.5,
              cornerRadius: 6,
              valueFormatter: (v) => `${v.value} ${v.value === 1 ? 'expediente' : 'expedientes'}`,
            },
          ]}
          hideLegend
          width={180}
          height={180}
          margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <Stack
          sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Typography variant="h3" component="span">
            {pending.count}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            por pagar
          </Typography>
        </Stack>
      </Box>
      <Stack spacing={1} sx={{ width: '100%' }} aria-hidden>
        {slices.map((s) => (
          <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color }} />
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {s.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <ChartDataTable
        caption="Expedientes por pagar según vencimiento"
        columns={['Grupo', 'Expedientes']}
        rows={slices.map((s) => [s.label, String(s.value)])}
      />
    </Stack>
  );
}

import type { DashboardDto } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { vars } from '../../app/theme';
import { formatCompactMoney, formatDate, formatMoney, formatShortDate } from '../../lib/format';
import { ChartDataTable } from './ChartDataTable';

/**
 * Importe por día de pago, una serie por moneda (AC-009-03). Las monedas van lado a lado, nunca apiladas
 * ni sumadas.
 */
export function PayDayBarChart({ days }: { days: DashboardDto['byPayDay'] }) {
  const theme = useTheme();
  const palette = vars(theme).palette;
  const currencies = (['MXN', 'USD'] as const).filter((c) =>
    days.some((d) => Number(d.amount[c]) > 0),
  );
  const colors = { MXN: palette.primary.main, USD: palette.success.main };

  return (
    <Box sx={{ position: 'relative' }}>
      <Box aria-hidden sx={{ height: { xs: 220, sm: 260 } }}>
        <BarChart
          xAxis={[
            {
              scaleType: 'band',
              data: days.map((d) => d.payOn),
              valueFormatter: (v: string, ctx) =>
                ctx.location === 'tick' ? formatShortDate(v) : formatDate(v),
              // Con pocos días las barras quedarían anchísimas: más hueco entre categorías.
              categoryGapRatio: days.length <= 3 ? 0.7 : 0.45,
              barGapRatio: 0.15,
              disableLine: true,
              disableTicks: true,
            },
          ]}
          yAxis={[
            {
              valueFormatter: (v: number) => formatCompactMoney(v),
              disableLine: true,
              disableTicks: true,
              width: 56,
            },
          ]}
          series={currencies.map((currency) => ({
            label: currency,
            color: colors[currency],
            data: days.map((d) => Number(d.amount[currency])),
            valueFormatter: (v: number | null) => formatMoney(String(v ?? 0), currency),
          }))}
          grid={{ horizontal: true }}
          borderRadius={6}
          hideLegend={currencies.length < 2}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
          sx={{
            '& .MuiChartsGrid-line': { stroke: palette.divider, strokeDasharray: '3 4' },
            '& .MuiChartsAxis-tickLabel': { fill: palette.text.secondary },
          }}
        />
      </Box>
      <ChartDataTable
        caption="Importe por día de pago"
        columns={['Día de pago', 'Expedientes', ...currencies]}
        rows={days.map((d) => [
          formatDate(d.payOn),
          String(d.count),
          ...currencies.map((c) => formatMoney(d.amount[c], c)),
        ])}
      />
    </Box>
  );
}

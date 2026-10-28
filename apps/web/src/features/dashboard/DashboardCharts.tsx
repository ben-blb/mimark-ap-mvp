import type { DashboardDto } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { vars } from '../../app/theme';
import { currenciesWithAmount, Money } from '../../components/Money';
import { formatPayDay } from '../../lib/format';
import {
  currenciesIn,
  type DueBucket,
  type DueBucketKey,
  dueBuckets,
  payDayShare,
} from './portfolio';

const plural = (n: number) => `${n} ${n === 1 ? 'expediente' : 'expedientes'}`;

/** Monto por moneda, una debajo de otra. MXN y USD nunca se suman. */
function Amounts(props: { amount: DashboardDto['totals']['pending']['amount']; cents?: boolean }) {
  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      {currenciesWithAmount(props.amount).map((c) => (
        <Money key={c} amount={props.amount[c]} currency={c} cents={props.cents} />
      ))}
    </Stack>
  );
}

/**
 * Próximos días de pago (AC-010-03): una fila por día con su barra proporcional, el total y el número de
 * expedientes. Cada fila es un botón que filtra la tabla del tablero a ese día.
 */
export function PayDayTimeline(props: {
  days: DashboardDto['byPayDay'];
  selected: string | null;
  onSelect: (payOn: string | null) => void;
}) {
  const share = payDayShare(props.days);
  return (
    <Box component="ul" aria-label="Próximos días de pago" sx={{ m: 0, p: 0 }}>
      {props.days.map((day, index) => {
        const active = props.selected === day.payOn;
        return (
          <Box component="li" key={day.payOn} sx={{ listStyle: 'none' }}>
            <Box
              component="button"
              type="button"
              aria-pressed={active}
              onClick={() => props.onSelect(active ? null : day.payOn)}
              sx={(theme) => ({
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                width: '100%',
                display: 'grid',
                gridTemplateColumns: { xs: '84px 1fr auto', sm: '96px minmax(0, 1fr) 128px 104px' },
                columnGap: 2,
                alignItems: 'center',
                minHeight: 44,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                transition: 'background-color 120ms ease',
                bgcolor: active ? 'background.surface2' : 'transparent',
                '&:hover': { bgcolor: active ? 'background.surface2' : 'background.surface1' },
                '&:focus-visible': {
                  outline: `2px solid ${vars(theme).palette.primary.main}`,
                  outlineOffset: -2,
                },
              })}
            >
              <Typography
                variant="body2"
                component="span"
                sx={{ fontWeight: 500, color: active ? 'primary.main' : 'text.primary', pl: 1 }}
              >
                {formatPayDay(day.payOn)}
              </Typography>
              <Box
                aria-hidden
                sx={{
                  height: 4,
                  bgcolor: 'background.surface2',
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${Math.max(2, share[index]! * 100)}%`,
                    bgcolor: active ? 'primary.main' : 'text.tertiary',
                  }}
                />
              </Box>
              <Box sx={{ fontSize: '0.875rem', textAlign: 'right' }}>
                <Amounts amount={day.amount} />
              </Box>
              <Typography
                variant="caption"
                component="span"
                sx={{
                  color: 'text.tertiary',
                  textAlign: 'right',
                  pr: 1,
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                {plural(day.count)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

const BUCKET_COLOR: Record<DueBucketKey, string> = {
  overdue: 'error.main',
  week: 'warning.main',
  horizon: 'text.secondary',
  later: 'text.tertiary',
};

/** Frase para cuando todo cae en un solo segmento: una barra de un color no informa (DESIGN.md). */
function singleSegmentText(bucket: DueBucket, horizon: number) {
  const all = bucket.count === 1 ? 'vence' : 'todos vencen';
  const when: Record<DueBucketKey, string> = {
    overdue: bucket.count === 1 ? 'ya venció' : 'todos ya vencieron',
    week: `${all} en los próximos 7 días`,
    horizon: `${all} entre 8 y ${horizon} días`,
    later: `${all} después de ${horizon} días`,
  };
  return `${plural(bucket.count)}, ${when[bucket.key]}.`;
}

/**
 * Cartera por vencimiento (AC-010-03): una barra apilada por moneda y, debajo, la misma información en una tabla
 * de texto (montos y conteos). Si solo un segmento tiene datos, se dice en una frase.
 */
export function DueStackedBar(props: { data: DashboardDto }) {
  const buckets = dueBuckets(props.data);
  const filled = buckets.filter((b) => b.count > 0);
  if (filled.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No hay nada por pagar.
      </Typography>
    );
  }
  if (filled.length === 1) {
    return (
      <Stack spacing={1}>
        <Typography variant="body2">{singleSegmentText(filled[0]!, props.data.horizon)}</Typography>
        <Box sx={{ fontSize: '0.875rem' }}>
          <Amounts amount={filled[0]!.amount} />
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {currenciesIn(buckets).map((currency) => {
        const total = buckets.reduce((sum, b) => sum + Number(b.amount[currency]), 0);
        return (
          <Box key={currency} aria-hidden>
            <Typography variant="caption" sx={{ color: 'text.tertiary' }}>
              {currency}
            </Typography>
            <Stack direction="row" sx={{ height: 8, mt: 0.5, gap: '2px' }}>
              {buckets.map((b) =>
                Number(b.amount[currency]) > 0 ? (
                  <Box
                    key={b.key}
                    sx={{
                      width: `${(Number(b.amount[currency]) / total) * 100}%`,
                      bgcolor: BUCKET_COLOR[b.key],
                    }}
                  />
                ) : null,
              )}
            </Stack>
          </Box>
        );
      })}
      <Box
        component="table"
        aria-label="Cartera por vencimiento"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.8125rem',
          '& td': { py: 0.75, borderBottom: 1, borderColor: 'divider', verticalAlign: 'top' },
          '& tr:last-of-type td': { borderBottom: 0 },
        }}
      >
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="span"
                    aria-hidden
                    sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: BUCKET_COLOR[b.key] }}
                  />
                  {b.label}
                </Box>
              </td>
              <Box component="td" sx={{ color: 'text.tertiary', textAlign: 'right', pr: 2 }}>
                {b.count}
              </Box>
              <Box component="td" sx={{ textAlign: 'right', color: 'text.tertiary' }}>
                {b.count > 0 ? <Amounts amount={b.amount} /> : '—'}
              </Box>
            </tr>
          ))}
        </tbody>
      </Box>
    </Stack>
  );
}

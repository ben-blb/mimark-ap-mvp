import { type DashboardDto, type Horizon, HORIZONS } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { currenciesWithAmount, Money } from '../../components/Money';
import { StatusDot } from '../../components/StatusDot';
import { SummaryStrip } from '../../components/SummaryStrip';
import { formatDay, formatPayDay } from '../../lib/format';
import { DueStackedBar, PayDayTimeline } from './DashboardCharts';

type Item = DashboardDto['items'][number];
type Bucket = DashboardDto['totals']['pending'];

const plural = (n: number) => `${n} ${n === 1 ? 'expediente' : 'expedientes'}`;

/** Cifra de la franja: sin centavos y cada moneda en su línea (AC-010-03, AC-006-06). */
function Figure({ bucket }: { bucket: Bucket }) {
  return (
    <Stack>
      {currenciesWithAmount(bucket.amount).map((c) => (
        <Typography key={c} component="p" sx={{ font: 'inherit' }}>
          <Money amount={bucket.amount[c]} currency={c} cents={false} />
        </Typography>
      ))}
    </Stack>
  );
}

function Flag({ item }: { item: Item }) {
  if (item.overdue) return <StatusDot tone="error">Vencido</StatusDot>;
  if (item.urgent) return <StatusDot tone="warning">Urgente</StatusDot>;
  return null;
}

function InvoiceLink({ item }: { item: Item }) {
  return (
    <Link
      component={RouterLink}
      to={`/expedientes/${item.id}`}
      sx={{ fontFamily: MONO, fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary' }}
    >
      {item.invoiceNumber}
    </Link>
  );
}

function Section(props: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ minWidth: 0 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5, minHeight: 28 }}
      >
        <Typography variant="h2">{props.title}</Typography>
        {props.action}
      </Stack>
      {props.children}
    </Box>
  );
}

/** Pestañas de horizonte con subrayado (no control segmentado). */
export function HorizonTabs(props: { value: Horizon; onChange: (horizon: Horizon) => void }) {
  return (
    <Tabs
      value={props.value}
      onChange={(_, value: Horizon) => props.onChange(value)}
      aria-label="Horizonte"
      sx={{ borderBottom: 0 }}
    >
      {HORIZONS.map((days) => (
        <Tab key={days} value={days} label={`${days} días`} />
      ))}
    </Tabs>
  );
}

/** Tablero de cartera (sin API): lo prueba y lo reutiliza DashboardPage. */
export function DashboardView(props: { data: DashboardDto; horizon: Horizon }) {
  const { data, horizon } = props;
  const [payDay, setPayDay] = useState<string | null>(null);
  const items = payDay ? data.items.filter((i) => i.payOn === payDay) : data.items;
  const { pending, overdue, upcoming, paidThisMonth } = data.totals;

  return (
    <Stack spacing={5}>
      <Stack spacing={2}>
        {data.inReview > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            <StatusDot tone="warning">
              {plural(data.inReview)} en revisión o por confirmar
            </StatusDot>
            {' · '}
            <Link
              component={RouterLink}
              to="/expedientes?status=requires_review,pending_confirmation"
            >
              Revisar →
            </Link>
          </Typography>
        )}
        <SummaryStrip
          aria-label="Resumen de la cartera"
          figures={[
            { label: 'Por pagar', value: <Figure bucket={pending} />, note: plural(pending.count) },
            overdue.count === 0
              ? {
                  label: 'Vencido',
                  value: (
                    <Box component="span" sx={{ color: 'success.main' }}>
                      Al corriente
                    </Box>
                  ),
                }
              : {
                  label: 'Vencido',
                  value: (
                    <Box sx={{ color: 'error.main' }}>
                      <Figure bucket={overdue} />
                    </Box>
                  ),
                  note: plural(overdue.count),
                },
            {
              label: `Próximos ${data.horizon} días`,
              value: <Figure bucket={upcoming} />,
              note: plural(upcoming.count),
            },
            {
              label: 'Pagado este mes',
              value: <Figure bucket={paidThisMonth} />,
              note: plural(paidThisMonth.count),
            },
          ]}
        />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 5, md: 6 },
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' },
        }}
      >
        <Section title="Próximos días de pago">
          {data.byPayDay.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No hay pagos pendientes.
            </Typography>
          ) : (
            <PayDayTimeline days={data.byPayDay} selected={payDay} onSelect={setPayDay} />
          )}
        </Section>
        <Section title="Cartera por vencimiento">
          <DueStackedBar data={data} />
        </Section>
      </Box>

      <Section
        title={payDay ? `Expedientes del ${formatPayDay(payDay)}` : 'Expedientes del horizonte'}
        action={
          payDay && (
            <Button size="small" onClick={() => setPayDay(null)}>
              Ver todo el horizonte
            </Button>
          )
        }
      >
        <DataTable
          aria-label="Expedientes del horizonte"
          items={items}
          getKey={(item) => item.id}
          empty={
            payDay
              ? `No hay expedientes del horizonte que se paguen el ${formatPayDay(payDay)}.`
              : `No hay expedientes por pagar en estos ${horizon} días.`
          }
          head={
            <TableRow>
              <TableCell>Proveedor</TableCell>
              <TableCell>Factura</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Vence</TableCell>
              <TableCell>Paga</TableCell>
              <TableCell />
            </TableRow>
          }
          row={(item) => (
            <DataRow
              key={item.id}
              to={`/expedientes/${item.id}`}
              label={`${item.supplierName} ${item.invoiceNumber}`}
            >
              <TableCell sx={{ minWidth: 200 }}>
                <Ellipsis>{item.supplierName}</Ellipsis>
              </TableCell>
              <TableCell>
                <InvoiceLink item={item} />
              </TableCell>
              <TableCell align="right">
                <Money amount={item.total} currency={item.currency} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDay(item.dueOn)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPayDay(item.payOn)}</TableCell>
              <TableCell>
                <Flag item={item} />
              </TableCell>
            </DataRow>
          )}
          card={(item) => (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500 }} noWrap>
                    {item.supplierName}
                  </Typography>
                  <InvoiceLink item={item} />
                </Box>
                <Money amount={item.total} currency={item.currency} />
              </Stack>
              <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-end' }}>
                <CardField label="Vence">{formatDay(item.dueOn)}</CardField>
                <CardField label="Paga">{formatPayDay(item.payOn)}</CardField>
                <Box sx={{ flexGrow: 1 }} />
                <Flag item={item} />
              </Stack>
            </Stack>
          )}
        />
      </Section>
      {data.items.length === 0 && data.byPayDay.length === 0 && (
        <EmptyState>Sin movimientos por ahora.</EmptyState>
      )}
    </Stack>
  );
}

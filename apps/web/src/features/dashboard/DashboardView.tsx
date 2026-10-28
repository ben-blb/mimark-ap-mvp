import { type DashboardDto, type Horizon, HORIZONS } from '@mimark/contracts/dashboard';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import { MONO, tonal } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { PayDayBarChart } from '../../components/charts/PayDayBarChart';
import { PortfolioDonut } from '../../components/charts/PortfolioDonut';
import { EmptyState } from '../../components/EmptyState';
import { ResponsiveList } from '../../components/ResponsiveList';
import { StatCard } from '../../components/StatCard';
import { formatDate, formatMoney } from '../../lib/format';

type Item = DashboardDto['items'][number];

function Flags({ item }: { item: Item }) {
  return (
    <Stack direction="row" spacing={0.5}>
      {item.urgent && <Chip size="small" color="warning" label="Urgente" />}
      {item.overdue && <Chip size="small" color="error" label="Vencido" />}
    </Stack>
  );
}

function InvoiceLink({ item }: { item: Item }) {
  return (
    <Link
      component={RouterLink}
      to={`/expedientes/${item.id}`}
      sx={{ fontFamily: MONO, fontWeight: 600 }}
    >
      {item.invoiceNumber}
    </Link>
  );
}

/** Tablero de cartera (sin API): lo prueba y lo reutiliza DashboardPage. */
export function DashboardView(props: {
  data: DashboardDto;
  horizon: Horizon;
  onHorizonChange: (horizon: Horizon) => void;
}) {
  const { data, horizon } = props;
  return (
    <Stack spacing={3}>
      <ToggleButtonGroup
        size="small"
        exclusive
        aria-label="Horizonte"
        value={horizon}
        onChange={(_, value: Horizon | null) => value && props.onHorizonChange(value)}
      >
        {HORIZONS.map((days) => (
          <ToggleButton key={days} value={days}>
            {days} días
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {data.inReview > 0 && (
        <Paper
          sx={(theme) => ({
            ...tonal(theme, 'info', 0.1),
            backdropFilter: 'none',
            border: 0,
            boxShadow: 'none',
            p: 2,
            display: 'flex',
            gap: 2,
            alignItems: { sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
          })}
        >
          <FactCheckOutlined aria-hidden />
          <Typography sx={{ flexGrow: 1, color: 'text.primary' }}>
            {data.inReview} {data.inReview === 1 ? 'expediente' : 'expedientes'} en revisión o por
            confirmar.
          </Typography>
          <Button
            component={RouterLink}
            to="/expedientes?status=requires_review,pending_confirmation"
            variant="contained"
            size="small"
          >
            Ver expedientes
          </Button>
        </Paper>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        }}
      >
        <StatCard label="Por pagar" icon={<PaymentsOutlined />} {...data.totals.pending} />
        <StatCard label="Vencidos" icon={<ErrorOutline />} tone="error" {...data.totals.overdue} />
        <StatCard
          label={`Próximos ${data.horizon} días`}
          icon={<EventOutlined />}
          tone="warning"
          {...data.totals.upcoming}
        />
        <StatCard
          label="Pagados este mes"
          icon={<CheckCircleOutline />}
          tone="success"
          {...data.totals.paidThisMonth}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' },
        }}
      >
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h2">Por día de pago</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Miércoles y viernes, por moneda.
          </Typography>
          {data.byPayDay.length === 0 ? (
            <EmptyState>No hay pagos pendientes.</EmptyState>
          ) : (
            <PayDayBarChart days={data.byPayDay} />
          )}
        </Paper>
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Cartera por vencimiento
          </Typography>
          <PortfolioDonut data={data} />
        </Paper>
      </Box>

      <Box>
        <Typography variant="h2" sx={{ mb: 1.5 }}>
          Expedientes del horizonte
        </Typography>
        <ResponsiveList
          aria-label="Expedientes del horizonte"
          items={data.items}
          getKey={(item) => item.id}
          empty={`No hay expedientes por pagar en estos ${horizon} días.`}
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
            <TableRow key={item.id} hover>
              <TableCell sx={{ fontWeight: 500 }}>{item.supplierName}</TableCell>
              <TableCell>
                <InvoiceLink item={item} />
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(item.total, item.currency)}
              </TableCell>
              <TableCell>{formatDate(item.dueOn)}</TableCell>
              <TableCell>{formatDate(item.payOn)}</TableCell>
              <TableCell>
                <Flags item={item} />
              </TableCell>
            </TableRow>
          )}
          card={(item) => (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {item.supplierName}
                  </Typography>
                  <InvoiceLink item={item} />
                </Box>
                <Typography
                  sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                >
                  {formatMoney(item.total, item.currency)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={3} sx={{ alignItems: 'flex-end' }}>
                <CardField label="Vence">{formatDate(item.dueOn)}</CardField>
                <CardField label="Paga">{formatDate(item.payOn)}</CardField>
                <Box sx={{ flexGrow: 1 }} />
                <Flags item={item} />
              </Stack>
            </Stack>
          )}
        />
      </Box>
    </Stack>
  );
}

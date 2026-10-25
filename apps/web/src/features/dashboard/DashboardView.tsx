import {
  type DashboardDto,
  type Horizon,
  HORIZONS,
  type MoneyByCurrency,
} from '@mimark/contracts/dashboard';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import { formatDate, formatMoney } from '../../lib/format';

/** Cada moneda en su línea: MXN y USD nunca se suman. Si ambas están en cero se muestra el cero en MXN. */
function Amounts({ amount }: { amount: MoneyByCurrency }) {
  const shown = (['MXN', 'USD'] as const).filter((c) => Number(amount[c]) > 0);
  return (
    <Stack>
      {(shown.length > 0 ? shown : (['MXN'] as const)).map((currency) => (
        <Typography key={currency} variant="h2" component="p">
          {formatMoney(amount[currency], currency)}
        </Typography>
      ))}
    </Stack>
  );
}

function Indicator(props: {
  label: string;
  count: number;
  amount: MoneyByCurrency;
  color?: 'error';
}) {
  return (
    <Paper sx={{ p: 2, flex: 1, minWidth: 200 }}>
      <Typography variant="body2" color={props.color ?? 'text.secondary'}>
        {props.label}
      </Typography>
      <Amounts amount={props.amount} />
      <Typography variant="caption" color="text.secondary">
        {props.count} {props.count === 1 ? 'expediente' : 'expedientes'}
      </Typography>
    </Paper>
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
        <Alert severity="info">
          {data.inReview} {data.inReview === 1 ? 'expediente' : 'expedientes'} en revisión o por
          confirmar.{' '}
          <Link
            component={RouterLink}
            to="/expedientes?status=requires_review,pending_confirmation"
          >
            Ver expedientes
          </Link>
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Indicator label="Por pagar" {...data.totals.pending} />
        <Indicator label="Vencidos" {...data.totals.overdue} color="error" />
        <Indicator label={`Próximos ${data.horizon} días`} {...data.totals.upcoming} />
        <Indicator label="Pagados este mes" {...data.totals.paidThisMonth} />
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>
          Por día de pago
        </Typography>
        {data.byPayDay.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay pagos pendientes.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {data.byPayDay.map((day) => (
              <Typography key={day.payOn} variant="body2">
                {formatDate(day.payOn)} · {day.count}{' '}
                {day.count === 1 ? 'expediente' : 'expedientes'} ·{' '}
                {(['MXN', 'USD'] as const)
                  .filter((c) => Number(day.amount[c]) > 0)
                  .map((c) => formatMoney(day.amount[c], c))
                  .join(' + ') || formatMoney('0', 'MXN')}
              </Typography>
            ))}
          </Stack>
        )}
      </Paper>

      <TableContainer component={Paper}>
        <Table aria-label="Expedientes del horizonte">
          <TableHead>
            <TableRow>
              <TableCell>Proveedor</TableCell>
              <TableCell>Factura</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Vence</TableCell>
              <TableCell>Paga</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.supplierName}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  <Link component={RouterLink} to={`/expedientes/${item.id}`}>
                    {item.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell align="right">{formatMoney(item.total, item.currency)}</TableCell>
                <TableCell>{formatDate(item.dueOn)}</TableCell>
                <TableCell>{formatDate(item.payOn)}</TableCell>
                <TableCell>
                  {item.urgent && (
                    <Chip size="small" color="warning" label="Urgente" sx={{ mr: 0.5 }} />
                  )}
                  {item.overdue && <Chip size="small" color="error" label="Vencido" />}
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No hay expedientes por pagar en estos {horizon} días.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

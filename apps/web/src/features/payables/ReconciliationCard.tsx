import type { PayableDto } from '@mimark/contracts/payables';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatAmount, formatMoney } from '../../lib/format';

type Order = NonNullable<PayableDto['purchaseOrder']>;

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && Number(a) === Number(b);

/** Qué cifras de la factura no cuadran con la orden (spec 019): subtotal con diferencias, total sin ellas. */
export function mismatches(payable: PayableDto) {
  const po = payable.purchaseOrder;
  const { subtotal, total } = payable.fields;
  const withDifferences = po?.receiptStatus === 'received_with_differences';
  return {
    subtotal:
      withDifferences &&
      !!subtotal &&
      po.receivedSubtotal !== null &&
      !same(subtotal, po.receivedSubtotal),
    total: !!po && !withDifferences && !!total && !same(total, po.total),
  };
}

/** «El subtotal de la factura ($30,875.50) no coincide con lo que recibió Almacén ($30,128.00).» */
export function receivedMismatchText(payable: PayableDto): string | null {
  const po = payable.purchaseOrder;
  const { subtotal } = payable.fields;
  if (!po || po.receivedSubtotal === null || !subtotal) return null;
  return `El subtotal de la factura (${formatAmount(subtotal)}) no coincide con lo que recibió Almacén (${formatAmount(po.receivedSubtotal)}).`;
}

function Cell(props: {
  label: string;
  value: string | null;
  currency: Order['currency'];
  flag?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {props.label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: props.flag ? 'warning.dark' : 'text.primary' }}
      >
        {props.value ? formatMoney(props.value, props.currency) : '—'}
      </Typography>
      {props.flag && (
        <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
          {props.flag}
        </Typography>
      )}
    </Box>
  );
}

/** Cuadro Pedido / Recibido / Facturado del expediente. Las notas de recepción se muestran como texto. */
export function ReconciliationCard({ payable }: { payable: PayableDto }) {
  const po = payable.purchaseOrder;
  if (!po) return null;
  const bad = mismatches(payable);
  return (
    <Stack component="section" aria-label="Pedido, recibido y facturado" spacing={1}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        }}
      >
        <Cell label="Pedido (subtotal)" value={po.linesSubtotal} currency={po.currency} />
        <Cell label="Recibido (subtotal)" value={po.receivedSubtotal} currency={po.currency} />
        <Cell
          label="Facturado (subtotal)"
          value={payable.fields.subtotal}
          currency={po.currency}
          flag={bad.subtotal ? 'No coincide con lo recibido' : undefined}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        }}
      >
        <Cell label="Total de la orden" value={po.total} currency={po.currency} />
        <Cell
          label="Total de la factura"
          value={payable.fields.total}
          currency={po.currency}
          flag={bad.total ? 'No coincide con la orden' : undefined}
        />
      </Box>
      {po.receiptNotes && (
        <Typography variant="body2" color="text.secondary">
          Notas de recepción: {po.receiptNotes}
        </Typography>
      )}
    </Stack>
  );
}

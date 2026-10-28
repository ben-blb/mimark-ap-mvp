import type { AssistantToolName } from '@mimark/contracts/assistant';
import { PayableDto, PayableList, type ReviewReason } from '@mimark/contracts/payables';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { MONO } from '../../app/theme';
import { Ellipsis } from '../../components/DataTable';
import { Money } from '../../components/Money';
import { PayableStatusDot } from '../../components/PayableStatusDot';
import { formatDay } from '../../lib/format';

/** Cuántos expedientes se dibujan en la mini tabla; el resto se cuenta. */
const MAX_ROWS = 8;

/** Folio del expediente con enlace a su detalle. */
function Folio(props: { id: string; text: string | null }) {
  return (
    <Link
      component={RouterLink}
      to={`/expedientes/${props.id}`}
      sx={{ fontFamily: MONO, fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary' }}
    >
      {props.text ?? 'Sin folio'}
    </Link>
  );
}

/** `listPayables` como mini tabla: folio, proveedor, monto, vencimiento y estado (AC-010-07). */
export function ExpedientesList({ list }: { list: PayableList }) {
  if (list.items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin expedientes con ese filtro.
      </Typography>
    );
  }
  const shown = list.items.slice(0, MAX_ROWS);
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table aria-label="Expedientes encontrados" sx={{ '& td, & th': { height: 36 } }}>
        <TableHead>
          <TableRow>
            <TableCell>Folio</TableCell>
            <TableCell>Proveedor</TableCell>
            <TableCell align="right">Monto</TableCell>
            <TableCell>Vence</TableCell>
            <TableCell>Estado</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {shown.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Folio id={p.id} text={p.invoiceNumber} />
              </TableCell>
              <TableCell sx={{ minWidth: 140 }}>
                <Ellipsis maxWidth={220}>{p.supplierName ?? '—'}</Ellipsis>
              </TableCell>
              <TableCell align="right">
                {p.total && p.currency ? <Money amount={p.total} currency={p.currency} /> : '—'}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {p.dueOn ? formatDay(p.dueOn) : '—'}
              </TableCell>
              <TableCell>
                <PayableStatusDot status={p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {list.items.length > shown.length && (
        <Typography variant="caption" sx={{ color: 'text.tertiary', display: 'block', mt: 1 }}>
          y {list.items.length - shown.length} más.
        </Typography>
      )}
    </Box>
  );
}

const PO_REASONS: ReviewReason['code'][] = [
  'PO_NOT_FOUND',
  'PO_MISMATCH',
  'PO_CANCELLED',
  'PO_ALREADY_INVOICED',
];

/** ✓ o ✕ con su texto: el color nunca va solo. */
function Check({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <Box component="span" sx={{ color: 'text.tertiary' }}>
        —
      </Box>
    );
  return (
    <Box component="span" sx={{ color: ok ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
      {ok ? '✓ Coincide' : '✕ No coincide'}
    </Box>
  );
}

/**
 * `getPayable` como factura vs OC vs recepción (AC-010-07). El ✓/✕ sale de las razones de revisión que calculó la
 * API: la web no repite las reglas.
 */
export function ExpedienteDetail({ payable }: { payable: PayableDto }) {
  const has = (...codes: ReviewReason['code'][]) =>
    payable.reviewReasons.some((r) => codes.includes(r.code));
  const po = payable.purchaseOrder;
  const { fields } = payable;
  const money = (amount: string | null | undefined, currency: string | null | undefined) =>
    amount && currency ? <Money amount={amount} currency={currency} /> : '—';

  const rows: { label: string; invoice: ReactNode; order: ReactNode; ok: boolean | null }[] = [
    {
      label: 'Proveedor (RFC)',
      invoice: fields.supplierTaxId ?? '—',
      order: payable.supplier?.taxId ?? '—',
      ok: payable.supplier ? !has('TAX_ID_MISMATCH') : null,
    },
    {
      label: 'Orden de compra',
      invoice: fields.poNumber ?? payable.selectedPoNumber ?? '—',
      order: po?.number ?? '—',
      ok: po || has(...PO_REASONS) ? !has(...PO_REASONS) : null,
    },
    {
      label: 'Total',
      invoice: money(fields.total, fields.currency),
      order: money(po?.total, po?.currency),
      ok: po ? !has('TOTAL_MISMATCH') : null,
    },
    {
      label: 'Moneda',
      invoice: fields.currency ?? '—',
      order: po?.currency ?? '—',
      ok: po ? !has('CURRENCY_MISMATCH') : null,
    },
    {
      label: 'Recepción',
      invoice: '',
      order: po ? (po.receiptStatus === 'received' ? 'Recibida' : 'Pendiente') : '—',
      ok: po ? po.receiptStatus === 'received' && !has('RECEIPT_NOT_CONFIRMED') : null,
    },
  ];

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        <Folio id={payable.id} text={fields.invoiceNumber} />
        {' · '}
        {fields.supplierName ?? payable.supplier?.name ?? 'Proveedor sin leer'}
        {' · '}
        <PayableStatusDot status={payable.status} />
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table
          aria-label="Factura contra orden de compra y recepción"
          sx={{ '& td, & th': { height: 36 } }}
        >
          <TableHead>
            <TableRow>
              <TableCell>Campo</TableCell>
              <TableCell>Factura</TableCell>
              <TableCell>OC / recepción</TableCell>
              <TableCell>Resultado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {row.label}
                </TableCell>
                <TableCell>{row.invoice}</TableCell>
                <TableCell>{row.order}</TableCell>
                <TableCell>
                  <Check ok={row.ok} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

/**
 * Registro de renderers (AC-010-07): herramienta → componente con su resultado. Solo dibujan datos ya validados
 * por su esquema; lo que no se reconoce se queda en la fila de estado como texto.
 */
export const toolRenderers: Partial<Record<AssistantToolName, (value: unknown) => ReactNode>> = {
  listPayables: (value) => {
    const parsed = PayableList.safeParse(value);
    return parsed.success ? <ExpedientesList list={parsed.data} /> : null;
  },
  getPayable: (value) => {
    const parsed = PayableDto.safeParse(value);
    return parsed.success ? <ExpedienteDetail payable={parsed.data} /> : null;
  },
};

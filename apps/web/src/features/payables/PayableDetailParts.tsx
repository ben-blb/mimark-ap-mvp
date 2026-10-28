import type { ExtractedField } from '@mimark/contracts/extraction';
import type { PayableDto } from '@mimark/contracts/payables';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { tonal } from '../../app/theme';
import { formatDate, formatMoney } from '../../lib/format';
import { FIELD_LABELS } from '../../lib/labels';

/** Piezas del detalle del expediente (sin API). Todo lo del documento se pinta como texto. */

const FIELD_ORDER: ExtractedField[] = [
  'supplierName',
  'supplierTaxId',
  'invoiceNumber',
  'issueDate',
  'purchaseOrderNumber',
  'subtotal',
  'taxes',
  'total',
  'currency',
  'taxUuid',
];

function fieldValue(payable: PayableDto, field: ExtractedField): string | null {
  const f = payable.fields;
  const money = (v: string | null) => (v && f.currency ? formatMoney(v, f.currency) : v);
  switch (field) {
    case 'supplierName':
      return f.supplierName;
    case 'supplierTaxId':
      return f.supplierTaxId;
    case 'invoiceNumber':
      return f.invoiceNumber;
    case 'issueDate':
      return f.issueDate ? formatDate(f.issueDate) : null;
    case 'purchaseOrderNumber':
      return f.poNumber;
    case 'subtotal':
      return money(f.subtotal);
    case 'taxes':
      return money(f.taxes);
    case 'total':
      return money(f.total);
    case 'currency':
      return f.currency;
    case 'taxUuid':
      return f.taxUuid;
  }
}

export function Section(props: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
        {props.icon && (
          <Box
            aria-hidden
            sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 20 } }}
          >
            {props.icon}
          </Box>
        )}
        <Typography variant="h2">{props.title}</Typography>
      </Stack>
      {props.children}
    </Paper>
  );
}

/** Campos extraídos: dudoso o faltante con fondo tonal y texto («Dudoso», «Falta»), AC-009-05. */
export function ExtractedFields({ payable }: { payable: PayableDto }) {
  return (
    <Section title="Datos extraídos" icon={<FactCheckOutlined />}>
      <Box component="dl" aria-label="Campos extraídos" sx={{ m: 0 }}>
        {FIELD_ORDER.map((field) => {
          const value = fieldValue(payable, field);
          const uncertain = payable.uncertainFields.includes(field);
          const evidence = payable.evidence.filter((e) => e.field === field);
          const flagged = value === null || uncertain;
          return (
            <Box
              key={field}
              sx={(theme) => ({
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)' },
                gap: { xs: 0.25, sm: 2 },
                py: 1.25,
                px: 1.25,
                mx: -1.25,
                borderRadius: '10px',
                '& + &': { borderTop: 1, borderColor: 'divider' },
                ...(flagged ? tonal(theme, 'warning', 0.1) : {}),
              })}
            >
              <Typography component="dt" variant="body2" color="text.secondary">
                {FIELD_LABELS[field]}
              </Typography>
              <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
                >
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{
                      fontWeight: 500,
                      color: 'text.primary',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {value ?? <em>Falta</em>}
                  </Typography>
                  {uncertain && <Chip size="small" color="warning" label="Dudoso" />}
                </Stack>
                {evidence.map((e, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}
                  >
                    {e.text}
                    {e.page !== null && ` (pág. ${e.page})`}
                  </Typography>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Section>
  );
}

/** Línea de tiempo vertical (AC-009-05): punto, título y detalle por evento, en orden. */
export function Timeline(props: { items: { title: string; detail: string; done?: boolean }[] }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {props.items.map((item, i) => (
        <Box
          component="li"
          key={i}
          sx={{
            position: 'relative',
            pl: 3,
            pb: i === props.items.length - 1 ? 0 : 2,
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 5,
              top: 8,
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: item.done === false ? 'text.disabled' : 'primary.main',
            },
            '&:not(:last-child)::after': {
              content: '""',
              position: 'absolute',
              left: 9.5,
              top: 22,
              bottom: 2,
              width: '1px',
              bgcolor: 'divider',
            },
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {item.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.detail}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Vencimiento, pago sugerido y programado, pago registrado y documentos (spec 005). */
export function PaymentCard({ payable }: { payable: PayableDto }) {
  const { schedule, payment, documents, discardReason } = payable;
  if (!schedule && !payment && !documents && !discardReason) return null;
  return (
    <Section title="Pago" icon={<PaymentsOutlined />}>
      {schedule && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">Vence: {formatDate(schedule.dueOn)}</Typography>
            {schedule.urgent && <Chip size="small" color="warning" label="Urgente" />}
            {schedule.overdue && <Chip size="small" color="error" label="Vencido" />}
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5,
            }}
          >
            <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(118 118 128 / 0.08)' }}>
              <Typography variant="body2">
                Pago sugerido: {formatDate(schedule.suggestedPayOn)}
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'rgba(118 118 128 / 0.08)' }}>
              <Typography variant="body2">
                Programado:{' '}
                {schedule.scheduledPayOn ? formatDate(schedule.scheduledPayOn) : 'sin programar'}
              </Typography>
            </Box>
          </Box>
        </Stack>
      )}
      {payment && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          Pagado el {formatDate(payment.paidOn)} ·{' '}
          {formatMoney(payment.amount, payable.fields.currency ?? 'MXN')} · Ref. {payment.reference}
        </Alert>
      )}
      {documents && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            size="small"
            color={documents.invoice === 'received' ? 'success' : 'default'}
            label={`Factura: ${documents.invoice === 'received' ? 'recibida' : 'pendiente'}`}
          />
          {documents.complement !== null && (
            <Chip
              size="small"
              color={documents.complement === 'received' ? 'success' : 'default'}
              label={`Complemento: ${documents.complement === 'received' ? 'recibido' : 'pendiente'}`}
            />
          )}
        </Stack>
      )}
      {discardReason && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          Motivo del descarte: {discardReason}
        </Typography>
      )}
    </Section>
  );
}

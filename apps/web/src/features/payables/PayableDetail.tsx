import type { PayableDto, PayableHistory } from '@mimark/contracts/payables';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { MOBILE_NAV_OFFSET, MONO, RADIUS, surface } from '../../app/theme';
import { Money } from '../../components/Money';
import { PayableStatusDot } from '../../components/PayableStatusDot';
import { formatDate, formatDateTime, formatMoney, paymentTermLabel } from '../../lib/format';
import {
  AUDIT_ACTION_LABELS,
  DOC_TYPE_LABELS,
  FIELD_LABELS,
  REVIEW_REASON_LABELS,
} from '../../lib/labels';
import { ExtractedFields, PaymentCard, Section, Timeline } from './PayableDetailParts';

/**
 * Vista del expediente (sin API). Todo lo que viene del documento o de la IA se pinta como texto
 * de React: nunca como HTML.
 */
export function PayableDetail(props: {
  payable: PayableDto;
  history: PayableHistory['items'];
  /** La barra de acciones (el detalle no decide cuáles hay: las dibuja quien lo usa). */
  actions?: ReactNode;
}) {
  const { payable } = props;
  const fileUrl = `/api/payables/${payable.id}/file`;
  const { total, currency } = payable.fields;

  return (
    <Stack spacing={3} sx={{ pb: props.actions ? { xs: 10, sm: 0 } : 0 }}>
      <Box>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
              <PayableStatusDot status={payable.status} />
              {payable.fields.docType && (
                <Typography variant="body2" color="text.secondary">
                  Tipo de documento: {DOC_TYPE_LABELS[payable.fields.docType]}
                </Typography>
              )}
            </Stack>
            <Typography variant="h1" sx={{ overflowWrap: 'anywhere' }}>
              {payable.file.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Subido por {payable.createdBy} el {formatDateTime(payable.createdAt)} · Recibido en
              CxP el {formatDate(payable.invoiceReceivedOn)}
            </Typography>
          </Box>
          {total && currency && (
            <Box sx={{ textAlign: { md: 'right' }, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" component="div">
                Total
              </Typography>
              <Typography variant="h3" component="p">
                <Money amount={total} currency={currency} />
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>

      {props.actions && (
        <Box
          sx={(theme) => ({
            [theme.breakpoints.down('sm')]: {
              ...surface(theme),
              position: 'fixed',
              left: 12,
              right: 12,
              bottom: `calc(${MOBILE_NAV_OFFSET} + 12px)`,
              zIndex: theme.zIndex.appBar,
              borderRadius: RADIUS.container,
              p: 1,
              overflowX: 'auto',
            },
          })}
        >
          {props.actions}
        </Box>
      )}

      {payable.failureCode && (
        <Alert severity="error" role="alert">
          No pudimos leer el documento. Usa «Reintentar» para procesarlo de nuevo.
        </Alert>
      )}

      {payable.reviewReasons.length > 0 && (
        <Alert severity="warning">
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Razones</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {payable.reviewReasons.map((reason) => (
              <li key={`${reason.code}:${reason.field ?? ''}`}>
                {REVIEW_REASON_LABELS[reason.code]}
                {reason.field && ` (${FIELD_LABELS[reason.field]})`}
              </li>
            ))}
          </Box>
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <Paper
          sx={{
            p: 1,
            height: { lg: 'calc(100dvh - 120px)' },
            position: { lg: 'sticky' },
            top: { lg: 24 },
            overflow: 'hidden',
          }}
        >
          <Stack
            direction="row"
            sx={{ px: 1, pt: 0.5, pb: 1, justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="caption" color="text.secondary">
              Documento original
            </Typography>
            <Link
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              Abrir
              <OpenInNewOutlined sx={{ fontSize: 16 }} aria-hidden />
            </Link>
          </Stack>
          {payable.file.mimeType === 'application/pdf' ? (
            <Box
              component="iframe"
              title="Documento original"
              src={fileUrl}
              sx={{
                // Los navegadores del teléfono no muestran PDF incrustados: ahí queda solo «Abrir».
                display: { xs: 'none', sm: 'block' },
                width: '100%',
                height: { sm: '60vh', lg: 'calc(100% - 36px)' },
                border: 0,
                borderRadius: '8px',
                bgcolor: 'background.paper',
              }}
            />
          ) : (
            <Box
              component="img"
              alt="Documento original"
              src={fileUrl}
              sx={{ maxWidth: '100%', display: 'block', borderRadius: '8px', mx: 'auto' }}
            />
          )}
        </Paper>

        <Stack spacing={3}>
          {payable.isApDocument !== null && <ExtractedFields payable={payable} />}

          <PaymentCard payable={payable} />

          <Section title="Orden de compra y proveedor">
            <Stack spacing={1}>
              {payable.purchaseOrder ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontFamily: MONO, fontWeight: 600 }}>
                    {payable.purchaseOrder.number}
                  </Typography>
                  <Typography variant="body2">
                    {formatMoney(payable.purchaseOrder.total, payable.purchaseOrder.currency)}
                  </Typography>
                  <Chip
                    size="small"
                    color={
                      payable.purchaseOrder.receiptStatus === 'received' ? 'success' : 'default'
                    }
                    label={
                      payable.purchaseOrder.receiptStatus === 'received'
                        ? 'Recepción confirmada'
                        : 'Sin recepción'
                    }
                  />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Sin orden de compra ligada.
                </Typography>
              )}
              {payable.supplier && (
                <Typography variant="body2">
                  {payable.supplier.name} ·{' '}
                  <Box component="span" sx={{ fontFamily: MONO }}>
                    {payable.supplier.taxId}
                  </Box>{' '}
                  · {paymentTermLabel(payable.supplier.creditDays)}
                </Typography>
              )}
              {payable.extraction && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Leído con {payable.extraction.model} · prompt {payable.extraction.promptVersion} ·{' '}
                  {(payable.extraction.ms / 1000).toFixed(1)} s
                </Typography>
              )}
            </Stack>
          </Section>

          <Section title="Historial">
            <Timeline
              items={props.history.map((event) => ({
                title: AUDIT_ACTION_LABELS[event.action] ?? event.action,
                detail: `${formatDateTime(event.at)} · ${event.actor}`,
              }))}
            />
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

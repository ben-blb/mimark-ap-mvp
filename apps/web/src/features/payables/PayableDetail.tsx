import type { ExtractedField } from '@mimark/contracts/extraction';
import type { PayableDto, PayableHistory } from '@mimark/contracts/payables';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { StatusChip } from '../../components/StatusChip';
import { formatDate, formatDateTime, formatMoney, paymentTermLabel } from '../../lib/format';
import {
  AUDIT_ACTION_LABELS,
  DOC_TYPE_LABELS,
  FIELD_LABELS,
  REVIEW_REASON_LABELS,
} from '../../lib/labels';

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

/**
 * Vista del expediente (sin API). Todo lo que viene del documento o de la IA se pinta como texto
 * de React: nunca como HTML.
 */
export function PayableDetail(props: {
  payable: PayableDto;
  history: PayableHistory['items'];
  retrying?: boolean;
  onRetry: () => void;
}) {
  const { payable } = props;
  const fileUrl = `/api/payables/${payable.id}/file`;
  const canRetry = payable.allowedActions.includes('retry');

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <div>
          <Typography variant="h1">{payable.file.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Subido por {payable.createdBy} el {formatDateTime(payable.createdAt)} · Recibido en CxP
            el {formatDate(payable.invoiceReceivedOn)}
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <StatusChip status={payable.status} />
          {canRetry && (
            <Button variant="contained" onClick={props.onRetry} loading={props.retrying}>
              Reintentar
            </Button>
          )}
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <Paper sx={{ p: 1, height: { lg: '80vh' } }}>
          {payable.file.mimeType === 'application/pdf' ? (
            <Box
              component="iframe"
              title="Documento original"
              src={fileUrl}
              sx={{ width: '100%', height: { xs: '60vh', lg: '100%' }, border: 0 }}
            />
          ) : (
            <Box
              component="img"
              alt="Documento original"
              src={fileUrl}
              sx={{ maxWidth: '100%', display: 'block' }}
            />
          )}
        </Paper>

        <Stack spacing={3}>
          {payable.failureCode && (
            <Typography color="error" role="alert">
              No pudimos leer el documento. Usa «Reintentar» para procesarlo de nuevo.
            </Typography>
          )}

          {payable.reviewReasons.length > 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h2" sx={{ mb: 1 }}>
                Razones
              </Typography>
              <List dense disablePadding>
                {payable.reviewReasons.map((reason) => (
                  <ListItem key={`${reason.code}:${reason.field ?? ''}`} disableGutters>
                    {REVIEW_REASON_LABELS[reason.code]}
                    {reason.field && ` (${FIELD_LABELS[reason.field]})`}
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          {payable.isApDocument !== null && (
            <Paper>
              <Table size="small" aria-label="Campos extraídos">
                <TableHead>
                  <TableRow>
                    <TableCell>Campo</TableCell>
                    <TableCell>Valor</TableCell>
                    <TableCell>Evidencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {FIELD_ORDER.map((field) => {
                    const value = fieldValue(payable, field);
                    const uncertain = payable.uncertainFields.includes(field);
                    const evidence = payable.evidence.filter((e) => e.field === field);
                    return (
                      <TableRow
                        key={field}
                        sx={value === null || uncertain ? { bgcolor: 'warning.light' } : undefined}
                      >
                        <TableCell>{FIELD_LABELS[field]}</TableCell>
                        <TableCell>
                          {value ?? <em>Falta</em>}
                          {uncertain && (
                            <Chip size="small" color="warning" label="Dudoso" sx={{ ml: 1 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          {evidence.map((e, i) => (
                            <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                              {e.text}
                              {e.page !== null && ` (pág. ${e.page})`}
                            </Typography>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {payable.fields.docType && (
                <Typography variant="caption" sx={{ p: 2, display: 'block' }}>
                  Tipo de documento: {DOC_TYPE_LABELS[payable.fields.docType]}
                </Typography>
              )}
            </Paper>
          )}

          <Paper sx={{ p: 2 }}>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Orden de compra y proveedor
            </Typography>
            {payable.purchaseOrder ? (
              <Typography variant="body2">
                {payable.purchaseOrder.number} ·{' '}
                {formatMoney(payable.purchaseOrder.total, payable.purchaseOrder.currency)} ·{' '}
                {payable.purchaseOrder.receiptStatus === 'received'
                  ? 'Recepción confirmada'
                  : 'Sin recepción'}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin orden de compra ligada.
              </Typography>
            )}
            {payable.supplier && (
              <Typography variant="body2">
                {payable.supplier.name} · {payable.supplier.taxId} ·{' '}
                {paymentTermLabel(payable.supplier.creditDays)}
              </Typography>
            )}
            {payable.extraction && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Leído con {payable.extraction.model} · prompt {payable.extraction.promptVersion} ·{' '}
                {(payable.extraction.ms / 1000).toFixed(1)} s
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Historial
            </Typography>
            <List dense disablePadding>
              {props.history.map((event, i) => (
                <ListItem key={i} disableGutters>
                  {formatDateTime(event.at)} · {AUDIT_ACTION_LABELS[event.action] ?? event.action} ·{' '}
                  {event.actor}
                </ListItem>
              ))}
            </List>
          </Paper>
        </Stack>
      </Box>
    </Stack>
  );
}

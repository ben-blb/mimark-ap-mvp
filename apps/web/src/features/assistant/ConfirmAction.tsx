import type { AssistantToolCall, AssistantToolName } from '@mimark/contracts/assistant';
import type { PayableDto } from '@mimark/contracts/payables';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RADIUS } from '../../app/theme';
import { formatDay, formatMoney, formatPayDay, formatTime } from '../../lib/format';
import { ASSISTANT_TOOL_LABELS, FIELD_LABELS, PAYABLE_STATUS_LABELS } from '../../lib/labels';
import { usePayable } from '../payables/payables.api';

/** `stale`: una propuesta de una conversación guardada que nadie decidió (spec 011). */
export type ProposalStatus = 'pending' | 'running' | 'confirmed' | 'cancelled' | 'failed' | 'stale';

type Input = Record<string, unknown>;
interface Change {
  label: string;
  before?: string;
  after: string;
}
interface Summary {
  headline: string[];
  changes: Change[];
}

const PAYABLE_TOOLS: AssistantToolName[] = [
  'retryPayable',
  'correctFields',
  'confirmPayable',
  'schedulePayable',
  'recordPayment',
  'updateDocuments',
  'discardPayable',
];

/** Nombres legibles de los datos que proponen las escrituras que no son de un expediente. */
const KEY_LABELS: Record<string, string> = {
  name: 'Nombre',
  taxId: 'RFC',
  creditDays: 'Días de crédito',
  currency: 'Moneda',
  active: 'Activo',
  number: 'Folio',
  supplierId: 'Proveedor',
  issuedOn: 'Fecha',
  total: 'Total',
  receivedOn: 'Recibida el',
  purchaseOrderNumber: 'Orden de compra',
  invoiceReceivedOn: 'Recibida en CxP',
};

const DOC_STATUS: Record<string, string> = { pending: 'Pendiente', received: 'Recibido' };
function text(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/**
 * La propuesta en lenguaje de negocio (AC-010-07): una línea de qué se hará y la lista de cambios antes → después.
 * Lo "antes" sale del expediente actual; si aún no carga, solo se ve lo propuesto.
 */
export function summarize(call: AssistantToolCall, payable?: PayableDto): Summary {
  const input = (call.input ?? {}) as Input;
  const folio = payable?.fields.invoiceNumber ?? payable?.file.name;
  const amount =
    payable?.fields.total && payable.fields.currency
      ? formatMoney(payable.fields.total, payable.fields.currency)
      : undefined;
  const status = payable ? PAYABLE_STATUS_LABELS[payable.status] : undefined;
  const line = (...parts: (string | undefined)[]) => parts.filter((p): p is string => !!p);

  switch (call.name) {
    case 'schedulePayable': {
      const payOn =
        typeof input.payOn === 'string' ? input.payOn : payable?.schedule?.suggestedPayOn;
      const current = payable?.schedule?.scheduledPayOn;
      return {
        headline: line('Programar pago', folio, payOn && formatPayDay(payOn), amount),
        changes: [
          {
            label: 'Fecha de pago',
            before: current ? formatPayDay(current) : 'Sin programar',
            after: payOn ? formatPayDay(payOn) : 'La sugerida',
          },
        ],
      };
    }
    case 'recordPayment': {
      const currency = payable?.fields.currency ?? '';
      return {
        headline: line(
          'Registrar pago',
          folio,
          formatDay(text(input.paidOn)),
          formatMoney(text(input.amount), currency).trim(),
        ),
        changes: [
          { label: 'Estado', before: status, after: 'Pagado' },
          { label: 'Referencia', after: text(input.reference) },
        ],
      };
    }
    case 'confirmPayable':
      return {
        headline: line('Confirmar expediente', folio, amount),
        changes: [{ label: 'Estado', before: status, after: 'Confirmado' }],
      };
    case 'discardPayable':
      return {
        headline: line('Descartar expediente', folio),
        changes: [
          { label: 'Estado', before: status, after: 'Descartado' },
          { label: 'Motivo', after: text(input.reason) },
        ],
      };
    case 'correctFields':
      return {
        headline: line('Corregir campos', folio),
        changes: Object.entries(input)
          .filter(([key]) => key !== 'id')
          .map(([key, value]) => ({
            label: FIELD_LABELS[key as keyof typeof FIELD_LABELS] ?? key,
            before: text(payable?.fields[key as keyof PayableDto['fields']]),
            after: text(value),
          })),
      };
    case 'updateDocuments':
      return {
        headline: line('Actualizar documentos', folio),
        changes: [
          ['invoiceDocStatus', 'Factura física', payable?.documents?.invoice],
          ['complementStatus', 'Complemento de pago', payable?.documents?.complement],
        ]
          .filter(([key]) => input[key as string] !== undefined)
          .map(([key, label, before]) => ({
            label: label as string,
            before: before ? DOC_STATUS[before] : '—',
            after: DOC_STATUS[input[key as string] as string] ?? text(input[key as string]),
          })),
      };
    case 'retryPayable':
      return { headline: line('Reintentar la extracción', folio), changes: [] };
    default:
      return {
        headline: line(ASSISTANT_TOOL_LABELS[call.name], text(input.name ?? input.number ?? '')),
        changes: Object.entries(input)
          .filter(([key]) => key !== 'id')
          .map(([key, value]) => ({ label: KEY_LABELS[key] ?? key, after: text(value) })),
      };
  }
}

function StatusLine(props: { status: ProposalStatus; at?: Date; error?: string }) {
  const color = props.status === 'failed' ? 'error.main' : 'text.secondary';
  const label = {
    pending: '',
    running: 'Ejecutando…',
    confirmed: `Hecho${props.at ? ` · ${formatTime(props.at)}` : ''}`,
    cancelled: 'Cancelada',
    failed: 'No se pudo hacer',
    stale: 'Sin decidir',
  }[props.status];
  return (
    <Typography variant="body2" sx={{ color, mt: 1.5 }}>
      {props.status === 'confirmed' && (
        <Box component="span" aria-hidden sx={{ color: 'success.main', mr: 0.75 }}>
          ✓
        </Box>
      )}
      {label}
    </Typography>
  );
}

/**
 * Una escritura propuesta por el asistente (AC-010-07, AC-008-07). Nada se ejecuta hasta que la persona confirma;
 * después queda el resultado con la hora. Todo es texto.
 */
export function ConfirmAction(props: {
  call: AssistantToolCall;
  status: ProposalStatus;
  at?: Date;
  error?: string;
  /** Por qué no se puede confirmar todavía (p. ej. falta el adjunto). */
  blockedReason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { call, status } = props;
  const id =
    typeof (call.input as Input | null)?.id === 'string'
      ? ((call.input as Input).id as string)
      : '';
  const payable = usePayable(id, !!id && PAYABLE_TOOLS.includes(call.name));
  const summary = summarize(call, payable.data);
  const pending = status === 'pending';

  return (
    <Box
      role="group"
      aria-label={`Propuesta: ${ASSISTANT_TOOL_LABELS[call.name]}`}
      sx={{
        border: 1,
        borderColor: pending ? 'primary.main' : 'divider',
        borderRadius: RADIUS.container,
        p: 2,
        transition: 'border-color 120ms ease',
      }}
    >
      <Typography sx={{ fontWeight: 500 }}>{summary.headline.join(' · ')}</Typography>
      {summary.changes.length > 0 && (
        <Box
          component="dl"
          sx={{
            m: 0,
            mt: 1.5,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 2,
            rowGap: 0.5,
            fontSize: '0.8125rem',
          }}
        >
          {summary.changes.map((change) => (
            <Box key={change.label} sx={{ display: 'contents' }}>
              <Box component="dt" sx={{ color: 'text.secondary' }}>
                {change.label}
              </Box>
              <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                {change.before !== undefined && (
                  <>
                    <Box component="span" sx={{ color: 'text.tertiary' }}>
                      {change.before}
                    </Box>
                    {' → '}
                  </>
                )}
                {change.after}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {pending && props.blockedReason && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {props.blockedReason}
        </Alert>
      )}
      {props.error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {props.error}
        </Alert>
      )}
      {pending ? (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={props.onConfirm} disabled={!!props.blockedReason}>
            Confirmar
          </Button>
          <Button color="inherit" onClick={props.onCancel}>
            Cancelar
          </Button>
        </Stack>
      ) : (
        <StatusLine status={status} at={props.at} error={props.error} />
      )}
    </Box>
  );
}

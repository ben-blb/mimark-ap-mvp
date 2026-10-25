import {
  ALLOWED_MIME_TYPES,
  FILE_REJECTION_MESSAGES,
  MAX_FILE_BYTES,
} from '@mimark/contracts/payables';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';

const ALLOWED_EXTENSIONS = /\.(pdf|png|jpe?g)$/i;

/** Revisa en el navegador lo mismo que la API (tipo y tamaño), con el mismo mensaje. */
export function validateFile(file: File): string | null {
  const typeOk =
    (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type) ||
    (file.type === '' && ALLOWED_EXTENSIONS.test(file.name));
  if (!typeOk) return FILE_REJECTION_MESSAGES.FILE_TYPE_NOT_ALLOWED;
  if (file.size > MAX_FILE_BYTES) return FILE_REJECTION_MESSAGES.FILE_TOO_LARGE;
  return null;
}

export interface UploadValues {
  file: File;
  purchaseOrderNumber: string;
  invoiceReceivedOn: string;
}

/** Formulario puro (sin API) para poder probarlo. */
export function UploadForm(props: {
  orders: { id: string; number: string; supplierName: string }[];
  today: string;
  pending: boolean;
  error: unknown;
  /** Enlace al expediente que quedó con error (502). */
  failedLink?: React.ReactNode;
  onSubmit: (values: UploadValues) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [invoiceReceivedOn, setInvoiceReceivedOn] = useState(props.today);
  const fieldErrors = props.error instanceof ApiError ? props.error.fieldErrors : {};
  const generalError =
    props.error instanceof ApiError && props.error.code === 'VALIDATION' ? null : props.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setFileError('Elige un archivo');
      return;
    }
    props.onSubmit({ file, purchaseOrderNumber, invoiceReceivedOn });
  }

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={submit}>
      <div>
        <Button component="label" variant="outlined" disabled={props.pending}>
          {file ? 'Cambiar archivo' : 'Elegir archivo'}
          <input
            hidden
            type="file"
            aria-label="Archivo"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              const problem = picked ? validateFile(picked) : null;
              setFile(problem ? null : picked);
              setFileError(problem);
            }}
          />
        </Button>
        {file && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {file.name}
          </Typography>
        )}
        {(fileError ?? fieldErrors.file) && (
          <Typography variant="body2" color="error" role="alert" sx={{ mt: 1 }}>
            {fileError ?? fieldErrors.file}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          PDF, PNG o JPG de hasta 4 MB.
        </Typography>
      </div>
      <TextField
        select
        label="Orden de compra (opcional)"
        value={purchaseOrderNumber}
        onChange={(e) => setPurchaseOrderNumber(e.target.value)}
        error={!!fieldErrors.purchaseOrderNumber}
        helperText={
          fieldErrors.purchaseOrderNumber ?? 'Si no eliges una, se usa la que diga el documento.'
        }
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      >
        <option value="">Que la lea del documento</option>
        {props.orders.map((order) => (
          <option key={order.id} value={order.number}>
            {order.number} · {order.supplierName}
          </option>
        ))}
      </TextField>
      <TextField
        label="Recibido en CxP"
        type="date"
        value={invoiceReceivedOn}
        onChange={(e) => setInvoiceReceivedOn(e.target.value)}
        error={!!fieldErrors.invoiceReceivedOn}
        helperText={fieldErrors.invoiceReceivedOn}
        slotProps={{ htmlInput: { max: props.today }, inputLabel: { shrink: true } }}
      />
      {props.pending && (
        <div role="status">
          <Typography variant="body2" sx={{ mb: 1 }}>
            Leyendo el documento…
          </Typography>
          <LinearProgress />
        </div>
      )}
      <ErrorAlert error={generalError} />
      {props.failedLink}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={props.onCancel} disabled={props.pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="contained" disabled={props.pending || !file}>
          Subir
        </Button>
      </Stack>
    </Stack>
  );
}

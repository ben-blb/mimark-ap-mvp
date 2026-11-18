import {
  type Month,
  type Source,
  type UploadDto,
  type UploadPreviewDto,
} from '@mimark/contracts/closing-uploads';
import { FILE_REJECTION_MESSAGES, MAX_FILE_BYTES } from '@mimark/contracts/payables';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { tonal } from '../../app/theme';
import { ErrorAlert } from '../../components/ErrorAlert';
import { StatusDot } from '../../components/StatusDot';
import { formatDate } from '../../lib/format';
import { SOURCE_HINTS, SOURCE_LABELS } from '../../lib/labels';
import { UploadPreview } from './UploadPreview';
import { useConfirmUpload, useDiscardUpload, useUploadSource } from './uploads.api';

/** Revisa en el navegador lo mismo que la API (tipo y tamaño), con el mismo mensaje. */
export function validateSheet(file: File): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return 'Solo se aceptan archivos .xlsx o .csv.';
  if (file.size > MAX_FILE_BYTES) return FILE_REJECTION_MESSAGES.FILE_TOO_LARGE;
  return null;
}

type Status = { tone: 'neutral' | 'warning' | 'success'; text: string };

function statusOf(uploads: UploadDto[]): Status {
  const confirmed = uploads.find((u) => u.status === 'confirmed');
  if (confirmed) {
    const when = formatDate(confirmed.createdAt.slice(0, 10));
    return {
      tone: 'success',
      text: `Confirmada · ${confirmed.entriesCount} movimientos · ${confirmed.uploadedBy}, ${when}`,
    };
  }
  if (uploads.some((u) => u.status === 'previewed')) {
    return { tone: 'warning', text: 'Vista previa pendiente' };
  }
  return { tone: 'neutral', text: 'Sin cargar' };
}

interface Props {
  source: Source;
  companyId: string;
  month: Month;
  /** Cargas del mes de esta empresa (todas las fuentes). */
  uploads: UploadDto[];
  /** Cuentas de la empresa, para elegir a cuál pertenece un estado de cuenta. */
  accounts: { id: string; name: string }[];
  kioskNames: Record<string, string>;
}

/** Una fuente del mes: su estado, dónde soltar el archivo y la vista previa antes de confirmar. */
export function SourceCard({ source, companyId, month, uploads, accounts, kioskNames }: Props) {
  const [accountChoice, setAccountChoice] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<UploadPreviewDto | null>(null);
  const upload = useUploadSource();
  const confirm = useConfirmUpload();
  const discard = useDiscardUpload();

  const isBank = source === 'bank_csv';
  const accountId = isBank ? accountChoice || accounts[0]?.id || '' : '';
  const mine = uploads.filter((u) => u.source === source && (!isBank || u.accountId === accountId));
  const status = statusOf(mine);
  const titleId = `source-${source}`;
  const blocked = companyId === '' || (isBank && accountId === '');

  function pick(file: File | null) {
    if (!file || blocked) return;
    const problem = validateSheet(file);
    setFileError(problem);
    if (problem) return;
    const form = new FormData();
    form.set('file', file);
    form.set('companyId', companyId);
    form.set('month', month);
    form.set('source', source);
    if (isBank) form.set('accountId', accountId);
    upload.mutate(form, { onSuccess: setPreview });
  }

  return (
    <Box
      component="section"
      aria-labelledby={titleId}
      sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', p: 2.5 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography id={titleId} component="h2" variant="h3">
            {SOURCE_LABELS[source]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {SOURCE_HINTS[source]}
          </Typography>
        </Box>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>

        {isBank && (
          <TextField
            select
            size="small"
            label="Cuenta"
            value={accountId}
            onChange={(e) => setAccountChoice(e.target.value)}
            slotProps={{ select: { native: true } }}
            helperText={accounts.length === 0 ? 'Agrega una cuenta en el catálogo' : ' '}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </TextField>
        )}

        <Box
          component="label"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!upload.isPending) pick(e.dataTransfer.files[0] ?? null);
          }}
          sx={(theme) => ({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            p: 2.5,
            borderRadius: '8px',
            border: '1.5px dashed',
            borderColor: dragging ? 'primary.main' : 'divider',
            textAlign: 'center',
            cursor: blocked || upload.isPending ? 'default' : 'pointer',
            opacity: blocked ? 0.6 : 1,
            ...(dragging ? tonal(theme, 'primary', 0.06) : {}),
            '&:hover': { borderColor: 'primary.main' },
            '&:focus-within': { borderColor: 'primary.main' },
          })}
        >
          <CloudUploadOutlined aria-hidden sx={{ fontSize: 28, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 600 }}>
            {upload.isPending ? 'Leyendo el archivo…' : 'Arrastra el archivo aquí'}
          </Typography>
          <Typography variant="body2" color="primary">
            Elegir archivo (.xlsx o .csv, hasta 4 MB)
          </Typography>
          <input
            hidden
            type="file"
            aria-label="Archivo"
            accept=".xlsx,.csv"
            disabled={blocked || upload.isPending}
            onChange={(e) => {
              pick(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </Box>
        {fileError && (
          <Typography variant="body2" color="error" role="alert">
            {fileError}
          </Typography>
        )}
        <ErrorAlert error={upload.error} />

        {preview && (
          <UploadPreview
            preview={preview}
            kioskNames={kioskNames}
            pending={confirm.isPending || discard.isPending}
            error={confirm.error ?? discard.error}
            onConfirm={() =>
              confirm.mutate(preview.upload.id, { onSuccess: () => setPreview(null) })
            }
            onDiscard={() =>
              discard.mutate(preview.upload.id, { onSuccess: () => setPreview(null) })
            }
          />
        )}
      </Stack>
    </Box>
  );
}

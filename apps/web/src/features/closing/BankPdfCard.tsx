import type {
  BankRowEdit,
  BankStatementDraft,
  Month,
  UploadDto,
} from '@mimark/contracts/closing-uploads';
import { FILE_REJECTION_MESSAGES, MAX_FILE_BYTES } from '@mimark/contracts/payables';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { StatusDot } from '../../components/StatusDot';
import { formatDate } from '../../lib/format';
import { SOURCE_HINTS, SOURCE_LABELS } from '../../lib/labels';
import { BankDraftReview } from './BankDraftReview';
import { FileDropzone } from './FileDropzone';
import {
  useConfirmUpload,
  useDiscardUpload,
  useEditBankDraft,
  useUploadBankPdf,
} from './uploads.api';

/** Revisa en el navegador lo mismo que la API (tipo y tamaño), con el mismo mensaje. */
export function validatePdf(file: File): string | null {
  if (!/\.pdf$/i.test(file.name)) return 'Solo se aceptan archivos PDF.';
  if (file.size > MAX_FILE_BYTES) return FILE_REJECTION_MESSAGES.FILE_TOO_LARGE;
  return null;
}

function statusOf(uploads: UploadDto[]): { tone: 'neutral' | 'warning' | 'success'; text: string } {
  const confirmed = uploads.find((u) => u.status === 'confirmed');
  if (confirmed) {
    const when = formatDate(confirmed.createdAt.slice(0, 10));
    return {
      tone: 'success',
      text: `Confirmada · ${confirmed.entriesCount} movimientos · ${confirmed.uploadedBy}, ${when}`,
    };
  }
  if (uploads.some((u) => u.status === 'previewed')) {
    return { tone: 'warning', text: 'Borrador pendiente de confirmar' };
  }
  return { tone: 'neutral', text: 'Sin cargar' };
}

interface Props {
  companyId: string;
  month: Month;
  uploads: UploadDto[];
  accounts: { id: string; name: string }[];
}

/** «Banco (PDF)»: la IA propone los movimientos del estado de cuenta y la persona los revisa (spec 022). */
export function BankPdfCard({ companyId, month, uploads, accounts }: Props) {
  const [accountChoice, setAccountChoice] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BankStatementDraft | null>(null);
  const upload = useUploadBankPdf();
  const edit = useEditBankDraft();
  const confirm = useConfirmUpload();
  const discard = useDiscardUpload();

  const accountId = accountChoice || accounts[0]?.id || '';
  const status = statusOf(
    uploads.filter((u) => u.source === 'bank_pdf' && u.accountId === accountId),
  );
  const blocked = companyId === '' || accountId === '';

  function pick(file: File | null) {
    if (!file || blocked) return;
    const problem = validatePdf(file);
    setFileError(problem);
    if (problem) return;
    const form = new FormData();
    form.set('file', file);
    form.set('companyId', companyId);
    form.set('month', month);
    form.set('accountId', accountId);
    upload.mutate(form, { onSuccess: setDraft });
  }

  const onEdit = (change: BankRowEdit) =>
    draft && edit.mutate({ id: draft.upload.id, rows: [change] }, { onSuccess: setDraft });

  return (
    <Box
      component="section"
      aria-labelledby="source-bank_pdf"
      sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', p: 2.5, gridColumn: '1 / -1' }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography id="source-bank_pdf" component="h2" variant="h3">
            {SOURCE_LABELS.bank_pdf}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {SOURCE_HINTS.bank_pdf}
          </Typography>
        </Box>
        <StatusDot tone={status.tone}>{status.text}</StatusDot>
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
        <FileDropzone
          accept=".pdf,application/pdf"
          hint="Elegir PDF (hasta 4 MB)"
          pending={upload.isPending}
          blocked={blocked}
          onPick={pick}
        />
        {fileError && (
          <Typography variant="body2" color="error" role="alert">
            {fileError}
          </Typography>
        )}
        <ErrorAlert error={upload.error} />

        {draft && (
          <BankDraftReview
            draft={draft}
            pending={edit.isPending || confirm.isPending || discard.isPending}
            error={edit.error ?? confirm.error ?? discard.error}
            onEdit={onEdit}
            onConfirm={(acceptDifference) =>
              confirm.mutate(
                { id: draft.upload.id, acceptDifference },
                { onSuccess: () => setDraft(null) },
              )
            }
            onDiscard={() => discard.mutate(draft.upload.id, { onSuccess: () => setDraft(null) })}
          />
        )}
      </Stack>
    </Box>
  );
}

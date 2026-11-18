import type { PreviewEntryDto, UploadPreviewDto } from '@mimark/contracts/closing-uploads';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { MONO } from '../../app/theme';
import { CardField } from '../../components/CardField';
import { DataRow, DataTable } from '../../components/DataTable';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatAmount, formatDate } from '../../lib/format';

/** `UNKNOWN_KIOSK:ZZ-9` → «Sin kiosko (ZZ-9)»: el aviso se dice con palabras, no solo con color. */
function flagLabel(flag: string): string {
  const [code, ...rest] = flag.split(':');
  return code === 'UNKNOWN_KIOSK' ? `Sin kiosko (${rest.join(':')})` : flag;
}

/**
 * Vista previa de una carga antes de confirmar. Todo lo que viene del archivo (conceptos, kioskos, motivos) se
 * muestra como texto: React nunca lo interpreta como HTML ni una celda `=CMD()` se evalúa (AC-021-14).
 */
export function UploadPreview(props: {
  preview: UploadPreviewDto;
  kioskNames: Record<string, string>;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { preview } = props;
  const kiosk = (e: PreviewEntryDto) => (e.kioskId ? (props.kioskNames[e.kioskId] ?? '—') : '—');
  const flags = (e: PreviewEntryDto) =>
    e.flags.map((f) => (
      <Typography key={f} variant="body2" color="warning.main">
        {flagLabel(f)}
      </Typography>
    ));

  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        Filas leídas: {preview.rowsRead} · Rechazadas: {preview.rowsRejected} · Sin kiosko:{' '}
        {preview.rowsUnknownKiosk} · Total: {formatAmount(preview.total)}
      </Typography>

      {preview.rejected.length > 0 && (
        <Box component="ul" aria-label="Filas rechazadas" sx={{ m: 0, pl: 2.5 }}>
          {preview.rejected.map((r) => (
            <Typography key={r.row} component="li" variant="body2" color="error">
              {`Fila ${r.row}: ${r.reason}`}
            </Typography>
          ))}
          {preview.rowsRejected > preview.rejected.length && (
            <Typography component="li" variant="body2" color="error">
              {`…y ${preview.rowsRejected - preview.rejected.length} más`}
            </Typography>
          )}
        </Box>
      )}

      <DataTable
        aria-label="Primeras filas"
        items={preview.sample}
        getKey={(e) => e.row}
        empty="El archivo no tiene filas que leer."
        head={
          <TableRow>
            <TableCell>Fila</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell>Kiosko</TableCell>
            <TableCell>Concepto</TableCell>
            <TableCell align="right">Importe</TableCell>
            <TableCell>Avisos</TableCell>
          </TableRow>
        }
        row={(e) => (
          <DataRow key={e.row}>
            <TableCell sx={{ fontFamily: MONO }}>{e.row}</TableCell>
            <TableCell>{formatDate(e.date)}</TableCell>
            <TableCell>{kiosk(e)}</TableCell>
            <TableCell sx={{ overflowWrap: 'anywhere' }}>{e.concept}</TableCell>
            <TableCell align="right">{formatAmount(e.amount)}</TableCell>
            <TableCell>{flags(e)}</TableCell>
          </DataRow>
        )}
        card={(e) => (
          <Stack spacing={0.5}>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{e.concept}</Typography>
            <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
              <CardField label="Fila">{e.row}</CardField>
              <CardField label="Fecha">{formatDate(e.date)}</CardField>
              <CardField label="Kiosko">{kiosk(e)}</CardField>
              <CardField label="Importe">{formatAmount(e.amount)}</CardField>
            </Stack>
            {flags(e)}
          </Stack>
        )}
      />
      {preview.rowsRead > preview.sample.length && (
        <Typography variant="caption" color="text.secondary">
          Se muestran las primeras {preview.sample.length} filas válidas.
        </Typography>
      )}

      <ErrorAlert error={props.error} />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button color="inherit" disabled={props.pending} onClick={props.onDiscard}>
          Descartar
        </Button>
        <Button variant="contained" loading={props.pending} onClick={props.onConfirm}>
          Confirmar
        </Button>
      </Stack>
    </Stack>
  );
}

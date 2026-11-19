import type {
  BankRowEdit,
  BankRowFlag,
  BankStatementDraft,
  BankStatementRow,
} from '@mimark/contracts/closing-uploads';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { MONO } from '../../app/theme';
import { ErrorAlert } from '../../components/ErrorAlert';
import { StatusDot } from '../../components/StatusDot';
import { formatAmount } from '../../lib/format';

/** El aviso se dice con palabras, no solo con color. */
const FLAG_LABELS: Record<BankRowFlag, string> = {
  UNCERTAIN: 'Revisar: el saldo no sigue al anterior',
  OUT_OF_MONTH: 'Fecha de otro mes: no se importa',
};

/** Una celda editable: guarda al salir del campo, solo si cambió. */
function Cell(props: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
  align?: 'right';
}) {
  return (
    <TextField
      size="small"
      defaultValue={props.value}
      disabled={props.disabled}
      onBlur={(e) => {
        if (e.target.value !== props.value) props.onCommit(e.target.value);
      }}
      slotProps={{
        htmlInput: {
          'aria-label': props.label,
          sx: { fontFamily: MONO, textAlign: props.align, minWidth: props.align ? 90 : 120 },
        },
      }}
    />
  );
}

function RowView(props: {
  row: BankStatementRow;
  onEdit: (edit: BankRowEdit) => void;
  pending: boolean;
}) {
  const { row, onEdit } = props;
  const off = row.discarded || props.pending;
  // Los importes con coma o espacios los normaliza la persona; la API valida el formato.
  const amount =
    (field: 'withdrawal' | 'deposit', other: 'withdrawal' | 'deposit') => (v: string) => {
      const value = v.trim() === '' ? null : v.trim();
      // Pasar un importe de depósito a retiro (o al revés) vacía el otro campo.
      onEdit({
        row: row.row,
        [field]: value,
        ...(value !== null && row[other] !== null ? { [other]: null } : {}),
      });
    };
  return (
    <TableRow sx={row.discarded ? { opacity: 0.55 } : undefined}>
      <TableCell sx={{ fontFamily: MONO }}>{row.row}</TableCell>
      <TableCell>
        <Cell
          label={`Fecha fila ${row.row}`}
          value={row.date}
          disabled={off}
          onCommit={(v) => onEdit({ row: row.row, date: v })}
        />
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        <Cell
          label={`Concepto fila ${row.row}`}
          value={row.concept}
          disabled={off}
          onCommit={(v) => onEdit({ row: row.row, concept: v })}
        />
      </TableCell>
      <TableCell align="right">
        <Cell
          label={`Retiro fila ${row.row}`}
          value={row.withdrawal ?? ''}
          disabled={off}
          align="right"
          onCommit={amount('withdrawal', 'deposit')}
        />
      </TableCell>
      <TableCell align="right">
        <Cell
          label={`Depósito fila ${row.row}`}
          value={row.deposit ?? ''}
          disabled={off}
          align="right"
          onCommit={amount('deposit', 'withdrawal')}
        />
      </TableCell>
      <TableCell align="right" sx={{ fontFamily: MONO }}>
        {row.balance === null ? '—' : formatAmount(row.balance)}
      </TableCell>
      <TableCell>
        {row.discarded && (
          <Typography variant="body2" color="text.secondary">
            Descartada
          </Typography>
        )}
        {row.flags.map((flag) => (
          <Typography key={flag} variant="body2" color="warning.main">
            {FLAG_LABELS[flag]}
          </Typography>
        ))}
      </TableCell>
      <TableCell>
        <Button
          size="small"
          color="inherit"
          disabled={props.pending}
          aria-label={`${row.discarded ? 'Restaurar' : 'Descartar'} fila ${row.row}`}
          onClick={() => onEdit({ row: row.row, discarded: !row.discarded })}
        >
          {row.discarded ? 'Restaurar' : 'Descartar'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Borrador de un estado de cuenta leído por IA, antes de confirmar (spec 022). Lo que viene del PDF (conceptos)
 * se muestra siempre como texto. «Confirmar» solo se habilita si los saldos cuadran o la persona acepta la
 * diferencia de forma explícita.
 */
export function BankDraftReview(props: {
  draft: BankStatementDraft;
  pending: boolean;
  error: unknown;
  onEdit: (edit: BankRowEdit) => void;
  onConfirm: (acceptDifference: boolean) => void;
  onDiscard: () => void;
}) {
  const { draft } = props;
  const { balanceCheck } = draft;
  // La aceptación vale solo para la diferencia que se vio: si se edita y cambia, se vuelve a pedir.
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const accepted = !balanceCheck.ok && acceptedFor === balanceCheck.difference;
  const canConfirm = balanceCheck.ok || accepted;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2">Saldo inicial: {formatAmount(draft.openingBalance)}</Typography>
        <Typography variant="body2">Saldo final: {formatAmount(draft.closingBalance)}</Typography>
        <StatusDot tone={balanceCheck.ok ? 'success' : 'error'}>
          {balanceCheck.ok
            ? 'Los saldos cuadran'
            : `Los saldos no cuadran: diferencia ${formatAmount(balanceCheck.difference)}`}
        </StatusDot>
      </Stack>
      {draft.warnings.includes('OPENING_BALANCE_MISMATCH') && (
        <Alert severity="warning">
          El saldo inicial no coincide con el saldo final confirmado del mes anterior de esta
          cuenta.
        </Alert>
      )}

      <TableContainer>
        <Table size="small" aria-label="Movimientos del estado de cuenta">
          <TableHead>
            <TableRow>
              <TableCell>Fila</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell>Concepto</TableCell>
              <TableCell align="right">Retiro</TableCell>
              <TableCell align="right">Depósito</TableCell>
              <TableCell align="right">Saldo</TableCell>
              <TableCell>Avisos</TableCell>
              <TableCell>
                <Box component="span" sx={{ position: 'absolute', left: -9999 }}>
                  Acciones
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {draft.rows.map((row) => (
              <RowView
                // La clave incluye los valores: tras guardar, el campo se vuelve a pintar con lo que dice el servidor.
                key={`${row.row}|${row.date}|${row.concept}|${row.withdrawal}|${row.deposit}|${row.discarded}`}
                row={row}
                pending={props.pending}
                onEdit={props.onEdit}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!balanceCheck.ok && (
        <FormControlLabel
          control={
            <Checkbox
              checked={accepted}
              onChange={(e) => setAcceptedFor(e.target.checked ? balanceCheck.difference : null)}
            />
          }
          label={`Acepto la diferencia de ${formatAmount(balanceCheck.difference)}`}
        />
      )}
      <ErrorAlert error={props.error} />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button color="inherit" disabled={props.pending} onClick={props.onDiscard}>
          Descartar
        </Button>
        <Button
          variant="contained"
          loading={props.pending}
          disabled={!canConfirm}
          onClick={() => props.onConfirm(accepted)}
        >
          Confirmar
        </Button>
      </Stack>
    </Stack>
  );
}

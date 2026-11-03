import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { TABULAR } from '../../app/theme';
import { formatAmount } from '../../lib/format';

/** Una partida tal como se captura: todo texto, sin importe (lo calcula el servidor). */
export type LineValues = {
  sku: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export const EMPTY_LINE: LineValues = {
  sku: '',
  description: '',
  quantity: '1',
  unit: 'pza',
  unitPrice: '',
};

/** Solo para mostrar mientras se captura; el importe que vale es el que calcula la API. */
export function previewAmount(line: Pick<LineValues, 'quantity' | 'unitPrice'>): number | null {
  const quantity = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!line.quantity.trim() || !line.unitPrice.trim()) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return null;
  return Math.round(quantity * price * 100) / 100;
}

export function previewSubtotal(lines: LineValues[]): number {
  return lines.reduce((sum, line) => sum + (previewAmount(line) ?? 0), 0);
}

const COLUMNS = { xs: '1fr 1fr', md: '120px minmax(180px, 1fr) 90px 90px 120px 110px 40px' };

interface Props {
  lines: LineValues[];
  /** fieldErrors de la API o del formulario con la ruta 'lines.2.quantity'. */
  errors: Record<string, string>;
  /** Campos que la IA leyó con dudas ('lines'): se resaltan para verificarlos. */
  uncertain?: boolean;
  /** Total con impuestos del formulario, para mostrar los impuestos implícitos. */
  total: string;
  currency: string;
  readOnly?: boolean;
  onChange: (lines: LineValues[]) => void;
}

/** Partidas de la OC: tarjetas que se apilan en el celular y una fila por partida en pantallas grandes. */
export function PoLinesEditor({
  lines,
  errors,
  uncertain,
  total,
  currency,
  readOnly,
  onChange,
}: Props) {
  const set = (index: number, patch: Partial<LineValues>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const subtotal = previewSubtotal(lines);
  const totalNumber = Number(total);
  const taxes = Number.isFinite(totalNumber) && total.trim() ? totalNumber - subtotal : null;

  const field = (index: number, name: keyof LineValues, label: string, extra = {}) => {
    const error = errors[`lines.${index}.${name}`];
    return (
      <TextField
        label={label}
        size="small"
        value={lines[index]?.[name] ?? ''}
        onChange={(e) => set(index, { [name]: e.target.value })}
        error={Boolean(error)}
        helperText={
          error ?? (uncertain && name === 'description' ? 'Verifícalo contra el PDF' : ' ')
        }
        disabled={readOnly}
        color={uncertain && !error ? 'warning' : undefined}
        {...extra}
      />
    );
  };

  return (
    <Stack spacing={1} aria-label="Partidas" role="group">
      <Typography variant="subtitle2">Partidas</Typography>
      {errors.lines && (
        <Typography variant="caption" color="error">
          {errors.lines}
        </Typography>
      )}
      {lines.map((line, i) => {
        const amount = previewAmount(line);
        return (
          <Box
            // La posición es la identidad: las partidas se capturan y se reemplazan juntas.
            key={i}
            role="group"
            aria-label={`Partida ${i + 1}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: COLUMNS,
              gap: 1,
              alignItems: 'start',
              p: { xs: 1.5, md: 0 },
              border: { xs: 1, md: 0 },
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {field(i, 'sku', 'SKU')}
            <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, order: { xs: -1, md: 0 } }}>
              {field(i, 'description', 'Descripción', { fullWidth: true })}
            </Box>
            {field(i, 'quantity', 'Cantidad', {
              slotProps: { htmlInput: { inputMode: 'decimal' } },
            })}
            {field(i, 'unit', 'Unidad')}
            {field(i, 'unitPrice', 'Precio unitario', {
              slotProps: { htmlInput: { inputMode: 'decimal' } },
            })}
            <Typography
              sx={{ ...TABULAR, pt: 1, textAlign: 'right' }}
              aria-label={`Importe de la partida ${i + 1}`}
            >
              {amount === null ? '—' : formatAmount(amount.toFixed(2))}
            </Typography>
            {!readOnly && (
              <IconButton
                aria-label={`Quitar partida ${i + 1}`}
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                disabled={lines.length === 1}
                sx={{ justifySelf: 'end' }}
              >
                <DeleteOutlined fontSize="small" />
              </IconButton>
            )}
          </Box>
        );
      })}
      {!readOnly && (
        <Box>
          <Button
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => onChange([...lines, EMPTY_LINE])}
          >
            Agregar partida
          </Button>
        </Box>
      )}
      <Stack spacing={0.25} sx={{ alignItems: 'flex-end', ...TABULAR }} aria-label="Totales">
        <Typography variant="body2">
          Suma de partidas: {formatAmount(subtotal.toFixed(2))} {currency}
        </Typography>
        {taxes !== null && (
          <Typography variant="body2" color={taxes < 0 ? 'error' : 'text.secondary'}>
            {taxes < 0
              ? 'El total es menor que la suma de las partidas'
              : `Impuestos (total − partidas): ${formatAmount(taxes.toFixed(2))} ${currency}`}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

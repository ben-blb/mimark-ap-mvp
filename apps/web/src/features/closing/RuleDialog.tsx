import type { CategoryDto } from '@mimark/contracts/closing';
import type { ReviewItemDto } from '@mimark/contracts/closing-review';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { ApiError } from '../../lib/api-client';
import { ErrorAlert } from '../../components/ErrorAlert';
import { sortCategories } from './categories';
import { useClassifyAndRule } from './review.api';

/** «Guardar como regla»: clasifica el movimiento y crea la regla en un paso (AC-023-04). */
export function RuleDialog(props: {
  item: ReviewItemDto;
  categoryId: string;
  categories: CategoryDto[];
  onDone: (reclassified: number) => void;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(props.categoryId);
  const [pattern, setPattern] = useState(props.item.concept);
  const save = useClassifyAndRule();
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Guardar como regla</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack spacing={2}>
          <TextField
            label="Patrón"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            error={!!fieldErrors.pattern}
            helperText={
              fieldErrors.pattern ??
              'Recorta el concepto a la parte que se repite (el nombre del comercio, por ejemplo).'
            }
            fullWidth
          />
          <TextField
            select
            label="Categoría"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            slotProps={{ select: { native: true } }}
            fullWidth
          >
            {sortCategories(props.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </TextField>
          {save.error && !fieldErrors.pattern && <ErrorAlert error={save.error} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={props.onClose}>
          Cancelar
        </Button>
        <Button
          disabled={save.isPending || pattern.trim().length < 3}
          onClick={() =>
            save.mutate(
              { id: props.item.id, categoryId, pattern },
              { onSuccess: (result) => props.onDone(result.reclassified) },
            )
          }
        >
          Guardar regla
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import type { CategoryDto } from '@mimark/contracts/closing';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { sortCategories } from './categories';

/** Elige la categoría de un movimiento: clasificar solo, o clasificar y guardar la regla (spec 023). */
export function ClassifyControls(props: {
  concept: string;
  categories: CategoryDto[];
  /** Categoría sugerida por la regla que más se parece. */
  suggested: string | null;
  pending: boolean;
  onClassify: (categoryId: string) => void;
  onRule: (categoryId: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(props.suggested ?? '');
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      <TextField
        select
        size="small"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        slotProps={{
          select: { native: true },
          htmlInput: { 'aria-label': `Categoría de ${props.concept}` },
        }}
        sx={{ minWidth: 190 }}
      >
        <option value="">Elige categoría</option>
        {sortCategories(props.categories).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </TextField>
      <Button
        size="small"
        disabled={!categoryId || props.pending}
        onClick={() => props.onClassify(categoryId)}
        aria-label={`Clasificar ${props.concept}`}
      >
        Clasificar
      </Button>
      <Button
        size="small"
        color="inherit"
        disabled={!categoryId || props.pending}
        onClick={() => props.onRule(categoryId)}
        aria-label={`Guardar como regla ${props.concept}`}
      >
        Guardar como regla
      </Button>
    </Stack>
  );
}

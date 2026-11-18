import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { useTestRule } from './closing.api';

/** Prueba un concepto contra las reglas activas antes de guardar una (AC-020-11). Solo lee. */
export function RuleTester() {
  const [concept, setConcept] = useState('');
  const test = useTestRule();
  const result = test.data;
  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label="Concepto del estado de cuenta"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 520 }}
        />
        <Button
          variant="outlined"
          disabled={!concept.trim()}
          loading={test.isPending}
          onClick={() => test.mutate(concept)}
        >
          Probar
        </Button>
      </Stack>
      <ErrorAlert error={test.error} />
      {result && (
        <Typography role="status" variant="body2">
          {result.rule && result.category
            ? `Gana la regla «${result.rule.pattern}» → ${result.category.name}.`
            : 'Ninguna regla activa coincide con este concepto.'}
        </Typography>
      )}
    </Stack>
  );
}

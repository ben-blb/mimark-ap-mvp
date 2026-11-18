import { SOURCES, type Month } from '@mimark/contracts/closing-uploads';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { SourceCard } from './SourceCard';
import { useAccounts, useCompanies, useKiosks } from './closing.api';
import { useUploads } from './uploads.api';

/** Mes en curso como 'AAAA-MM' (hora local del navegador). */
const currentMonth = (): Month => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Carga de las fuentes del mes de una empresa (spec 021). Solo para quien puede escribir en el cierre. */
export function UploadsPage() {
  const companies = useCompanies(false);
  const [companyChoice, setCompanyChoice] = useState('');
  const [month, setMonth] = useState<Month>(currentMonth);
  const companyId = companyChoice || companies.data?.items[0]?.id || '';

  const uploads = useUploads(companyId, month);
  const accounts = useAccounts(false).data?.items.filter((a) => a.companyId === companyId) ?? [];
  const kioskNames = Object.fromEntries(
    (useKiosks(false).data?.items ?? []).map((k) => [k.id, k.name]),
  );
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

  return (
    <>
      <PageHeader
        title="Cargas del cierre"
        actions={
          <Button component={Link} to="/cierre/catalogo" color="inherit">
            Catálogo
          </Button>
        }
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          label="Empresa"
          value={companyId}
          onChange={(e) => setCompanyChoice(e.target.value)}
          slotProps={{ select: { native: true } }}
          helperText={companies.data?.items.length === 0 ? 'Crea una empresa en el catálogo' : ' '}
          sx={{ minWidth: 260 }}
        >
          {companies.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </TextField>
        <TextField
          type="month"
          label="Mes"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          error={!monthValid}
          helperText={monthValid ? ' ' : 'Elige un mes'}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <ErrorAlert error={companies.error ?? uploads.error} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        {monthValid &&
          SOURCES.map((source) => (
            <SourceCard
              key={`${companyId}-${month}-${source}`}
              source={source}
              companyId={companyId}
              month={month}
              uploads={uploads.data?.items ?? []}
              accounts={accounts}
              kioskNames={kioskNames}
            />
          ))}
      </Box>
    </>
  );
}

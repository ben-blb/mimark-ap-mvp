import type { Month } from '@mimark/contracts/closing-uploads';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { CompanyDto } from '@mimark/contracts/closing';

/** Mes en curso como 'AAAA-MM' (hora local del navegador). */
export const currentMonth = (): Month => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Empresa y mes del cierre: lo primero que se elige en las pantallas de la 023. */
export function PeriodFilters(props: {
  companies: CompanyDto[] | undefined;
  companyId: string;
  month: string;
  onCompany: (id: string) => void;
  onMonth: (month: string) => void;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
      <TextField
        select
        label="Empresa"
        value={props.companyId}
        onChange={(e) => props.onCompany(e.target.value)}
        slotProps={{ select: { native: true } }}
        helperText={props.companies?.length === 0 ? 'Crea una empresa en el catálogo' : ' '}
        sx={{ minWidth: 260 }}
      >
        {props.companies?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </TextField>
      <TextField
        type="month"
        label="Mes"
        value={props.month}
        onChange={(e) => props.onMonth(e.target.value)}
        error={!isMonth(props.month)}
        helperText={isMonth(props.month) ? ' ' : 'Elige un mes'}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  );
}

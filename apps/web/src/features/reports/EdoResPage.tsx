import type { EdoResRowDto, ReportLine } from '@mimark/contracts/reports';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Money } from '../../components/Money';
import { TABULAR } from '../../app/theme';
import { DrillDialog } from './DrillDialog';
import { ReportShell, previousMonth, useReportFilters } from './ReportShell';
import { NUMERIC, ReportTable } from './ReportTable';
import { useEdoRes } from './reports.api';

const percentText = (value: string | null) => (value === null ? '—' : `${value} %`);

/** Mes anterior a uno dado ('AAAA-MM'). */
function monthBefore(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return previousMonth(new Date(y, m - 1, 1));
}

/** Estado de resultados del mes, con cada importe como enlace a las partidas que lo forman (spec 024). */
export function EdoResPage() {
  const filters = useReportFilters();
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState<ReportLine | null>(null);
  const compareTo = compare && filters.month ? monthBefore(filters.month) : '';
  const report = useEdoRes(filters.companyId, filters.month, compareTo);
  const rows = report.data?.rows ?? [];
  const showCompare = !!report.data?.compareTo;

  return (
    <ReportShell
      title="Estado de resultados"
      filters={filters}
      status={report.data?.status}
      error={report.error}
      compareTo={compareTo}
    >
      <FormControlLabel
        sx={{ mb: 1 }}
        control={<Checkbox checked={compare} onChange={(e) => setCompare(e.target.checked)} />}
        label="Comparar con el mes anterior"
      />
      {report.data && (
        <ReportTable label="Estado de resultados">
          <TableHead>
            <TableRow>
              <TableCell>Renglón</TableCell>
              <TableCell sx={NUMERIC}>Importe</TableCell>
              <TableCell sx={NUMERIC}>% de ventas</TableCell>
              {showCompare && <TableCell sx={NUMERIC}>Mes anterior</TableCell>}
              {showCompare && <TableCell sx={NUMERIC}>Diferencia</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <EdoRow key={row.key} row={row} compare={showCompare} onOpen={setOpen} />
            ))}
          </TableBody>
        </ReportTable>
      )}
      {report.data?.status === 'empty' && (
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          Este mes todavía no tiene movimientos.
        </Typography>
      )}
      <DrillDialog
        line={open}
        companyId={filters.companyId}
        month={filters.month}
        onClose={() => setOpen(null)}
      />
    </ReportShell>
  );
}

function EdoRow(props: {
  row: EdoResRowDto;
  compare: boolean;
  onOpen: (line: ReportLine) => void;
}) {
  const { row } = props;
  const strong = row.kind !== 'line';
  const amount = <Money amount={row.amount} currency="MXN" />;
  return (
    <TableRow sx={strong ? { '& td': { fontWeight: 600 } } : undefined}>
      <TableCell sx={{ pl: strong ? 2 : 4 }}>{row.label}</TableCell>
      <TableCell sx={NUMERIC}>
        {row.line ? (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => props.onOpen(row.line as ReportLine)}
            aria-label={`Ver partidas de ${row.label}: ${row.amount}`}
            sx={{ font: 'inherit', ...TABULAR }}
          >
            {amount}
          </Link>
        ) : (
          amount
        )}
      </TableCell>
      <TableCell sx={{ ...NUMERIC, ...TABULAR }}>{percentText(row.percentOfSales)}</TableCell>
      {props.compare && (
        <TableCell sx={NUMERIC}>
          <Money amount={row.previousAmount ?? '0.00'} currency="MXN" />
        </TableCell>
      )}
      {props.compare && (
        <TableCell sx={NUMERIC}>
          <Money amount={row.delta ?? '0.00'} currency="MXN" />
        </TableCell>
      )}
    </TableRow>
  );
}

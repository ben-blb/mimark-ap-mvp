import type { KioskRowDto } from '@mimark/contracts/reports';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Money } from '../../components/Money';
import { StatusDot } from '../../components/StatusDot';
import { TABULAR } from '../../app/theme';
import { ReportShell, useReportFilters } from './ReportShell';
import { NUMERIC, ReportTable, SortHeader, compareBy, useSort } from './ReportTable';
import { useKioskReport } from './reports.api';

type Column = 'name' | 'sales' | 'cost' | 'margin' | 'marginPercent' | 'profitBeforeOverhead';
const PICK: Record<Column, (r: KioskRowDto) => string | number | null> = {
  name: (r) => r.name,
  sales: (r) => r.sales,
  cost: (r) => r.cost,
  margin: (r) => r.margin,
  marginPercent: (r) => r.marginPercent,
  profitBeforeOverhead: (r) => r.profitBeforeOverhead,
};

/** Ventas y rentabilidad por kiosko; los gastos generales van aparte, sin prorratear (spec 024). */
export function KiosksPage() {
  const filters = useReportFilters();
  const report = useKioskReport(filters.companyId, filters.month);
  const { sort, toggle } = useSort<Column>({ key: 'marginPercent', direction: 'asc' });
  const data = report.data;
  // «Sin kiosko» siempre al final: no es un kiosko que se compare.
  const named = (data?.rows ?? [])
    .filter((r) => r.kioskId !== null)
    .sort(compareBy(PICK[sort.key], sort.direction));
  const rows = [...named, ...(data?.rows ?? []).filter((r) => r.kioskId === null)];
  const money = (value: string) => <Money amount={value} currency="MXN" />;

  return (
    <ReportShell title="Kioskos" filters={filters} status={data?.status} error={report.error}>
      {data && (
        <ReportTable label="Rentabilidad por kiosko">
          <TableHead>
            <TableRow>
              <SortHeader column="name" sort={sort} onSort={toggle}>
                Kiosko
              </SortHeader>
              <SortHeader column="sales" sort={sort} onSort={toggle} numeric>
                Ventas
              </SortHeader>
              <SortHeader column="cost" sort={sort} onSort={toggle} numeric>
                Costo
              </SortHeader>
              <SortHeader column="margin" sort={sort} onSort={toggle} numeric>
                Margen
              </SortHeader>
              <SortHeader column="marginPercent" sort={sort} onSort={toggle} numeric>
                % margen
              </SortHeader>
              <TableCell sx={NUMERIC}>Mermas</TableCell>
              <TableCell sx={NUMERIC}>Robos</TableCell>
              <TableCell sx={NUMERIC}>Comisiones</TableCell>
              <SortHeader column="profitBeforeOverhead" sort={sort} onSort={toggle} numeric>
                Utilidad antes de gastos generales
              </SortHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.kioskId ?? 'none'}>
                <TableCell>
                  {r.name}
                  {r.negativeMargin && (
                    <>
                      {' '}
                      <StatusDot tone="error">Margen negativo</StatusDot>
                    </>
                  )}
                </TableCell>
                <TableCell sx={NUMERIC}>{money(r.sales)}</TableCell>
                <TableCell sx={NUMERIC}>{money(r.cost)}</TableCell>
                <TableCell sx={{ ...NUMERIC, color: r.negativeMargin ? 'error.main' : undefined }}>
                  {money(r.margin)}
                </TableCell>
                <TableCell
                  sx={{
                    ...NUMERIC,
                    ...TABULAR,
                    color: r.negativeMargin ? 'error.main' : undefined,
                  }}
                >
                  {r.marginPercent === null ? '—' : `${r.marginPercent} %`}
                </TableCell>
                <TableCell sx={NUMERIC}>{money(r.waste)}</TableCell>
                <TableCell sx={NUMERIC}>{money(r.theft)}</TableCell>
                <TableCell sx={NUMERIC}>{money(r.commissions)}</TableCell>
                <TableCell sx={NUMERIC}>{money(r.profitBeforeOverhead)}</TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ '& td': { fontWeight: 600 } }}>
              <TableCell>Total</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.sales)}</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.cost)}</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.margin)}</TableCell>
              <TableCell />
              <TableCell sx={NUMERIC}>{money(data.totals.waste)}</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.theft)}</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.commissions)}</TableCell>
              <TableCell sx={NUMERIC}>{money(data.totals.profitBeforeOverhead)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={8}>Gastos generales (sin asignar)</TableCell>
              <TableCell sx={NUMERIC}>{money(data.overhead)}</TableCell>
            </TableRow>
            {Number(data.unclassified) !== 0 && (
              <TableRow>
                <TableCell colSpan={8}>Por clasificar</TableCell>
                <TableCell sx={NUMERIC}>{money(data.unclassified)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </ReportTable>
      )}
    </ReportShell>
  );
}

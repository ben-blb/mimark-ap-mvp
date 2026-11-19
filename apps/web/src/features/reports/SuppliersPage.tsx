import type { SupplierRowDto } from '@mimark/contracts/reports';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Money } from '../../components/Money';
import { formatDate } from '../../lib/format';
import { TABULAR } from '../../app/theme';
import { ReportShell, useReportFilters } from './ReportShell';
import { NUMERIC, ReportTable, SortHeader, compareBy, useSort } from './ReportTable';
import { useSupplierReport } from './reports.api';

type Column = 'name' | 'total' | 'count' | 'average' | 'percentOfSpend' | 'lastPaymentOn';
const PICK: Record<Column, (r: SupplierRowDto) => string | number | null> = {
  name: (r) => r.name,
  total: (r) => r.total,
  count: (r) => r.count,
  average: (r) => r.average,
  percentOfSpend: (r) => r.percentOfSpend,
  lastPaymentOn: (r) => r.lastPaymentOn,
};

/** Pagos del mes por proveedor, tomados de las reglas de clasificación (spec 024, RF-13). */
export function SuppliersReportPage() {
  const filters = useReportFilters();
  const report = useSupplierReport(filters.companyId, filters.month);
  const { sort, toggle } = useSort<Column>({ key: 'total', direction: 'desc' });
  const data = report.data;
  const rows = [...(data?.rows ?? [])].sort(compareBy(PICK[sort.key], sort.direction));

  return (
    <ReportShell title="Proveedores" filters={filters} status={data?.status} error={report.error}>
      {data && (
        <ReportTable label="Pagos por proveedor">
          <TableHead>
            <TableRow>
              <SortHeader column="name" sort={sort} onSort={toggle}>
                Proveedor
              </SortHeader>
              <SortHeader column="total" sort={sort} onSort={toggle} numeric>
                Pago total
              </SortHeader>
              <SortHeader column="count" sort={sort} onSort={toggle} numeric>
                Pagos
              </SortHeader>
              <SortHeader column="average" sort={sort} onSort={toggle} numeric>
                Ticket promedio
              </SortHeader>
              <SortHeader column="percentOfSpend" sort={sort} onSort={toggle} numeric>
                % del gasto
              </SortHeader>
              <TableCell>Primer pago</TableCell>
              <SortHeader column="lastPaymentOn" sort={sort} onSort={toggle}>
                Último pago
              </SortHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell sx={NUMERIC}>
                  <Money amount={r.total} currency="MXN" />
                </TableCell>
                <TableCell sx={{ ...NUMERIC, ...TABULAR }}>{r.count}</TableCell>
                <TableCell sx={NUMERIC}>
                  <Money amount={r.average} currency="MXN" />
                </TableCell>
                <TableCell sx={{ ...NUMERIC, ...TABULAR }}>{r.percentOfSpend} %</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.firstPaymentOn)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.lastPaymentOn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ReportTable>
      )}
      {data?.rows.length === 0 && (
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          No hay pagos a proveedores clasificados en este mes.
        </Typography>
      )}
    </ReportShell>
  );
}

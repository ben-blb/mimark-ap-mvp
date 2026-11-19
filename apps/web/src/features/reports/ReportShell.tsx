import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { ReportStatus } from '@mimark/contracts/reports';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { StatusDot, type DotTone } from '../../components/StatusDot';
import { REPORT_STATUS_LABELS } from '../../lib/labels';
import { PeriodFilters, isMonth } from '../closing/PeriodFilters';
import { exportUrl, useReportCompanies } from './reports.api';

const TABS = [
  { to: '/reportes/edo-res', label: 'EDO RES' },
  { to: '/reportes/kioskos', label: 'Kioskos' },
  { to: '/reportes/proveedores', label: 'Proveedores' },
];

const STATUS_TONES: Record<ReportStatus, DotTone> = {
  empty: 'neutral',
  provisional: 'warning',
  final: 'success',
};

/** El mes anterior como 'AAAA-MM': el que la gerencia revisa los días 1 y 2. */
export function previousMonth(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Empresa y mes viajan en la URL: las tres pantallas comparten el mismo periodo y se puede enlazar. */
export function useReportFilters() {
  const companies = useReportCompanies();
  const [params, setParams] = useSearchParams();
  const companyId = params.get('companyId') || companies.data?.items[0]?.id || '';
  const month = params.get('month') ?? previousMonth();
  const set = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(name, value);
        return next;
      },
      { replace: true },
    );
  return {
    companies,
    companyId,
    month: isMonth(month) ? month : '',
    monthText: month,
    setCompany: (id: string) => set('companyId', id),
    setMonth: (value: string) => set('month', value),
  };
}

/** Cabecera común: título, pestañas entre reportes, exportar, estado y filtros del periodo. */
export function ReportShell(props: {
  title: string;
  filters: ReturnType<typeof useReportFilters>;
  status: ReportStatus | undefined;
  error: unknown;
  compareTo?: string;
  children: ReactNode;
}) {
  const { filters } = props;
  const location = useLocation();
  const search = new URLSearchParams({
    companyId: filters.companyId,
    month: filters.monthText,
  }).toString();
  const ready = filters.companyId !== '' && filters.month !== '';

  return (
    <>
      <PageHeader
        title={props.title}
        actions={
          ready ? (
            <Button
              component="a"
              href={exportUrl(filters.companyId, filters.month, props.compareTo ?? '')}
              color="inherit"
              startIcon={<DownloadOutlined />}
            >
              Exportar a Excel
            </Button>
          ) : null
        }
      />
      <Tabs
        value={TABS.find((t) => t.to === location.pathname)?.to ?? false}
        aria-label="Reportes"
        sx={{ mb: 2 }}
        variant="scrollable"
        scrollButtons={false}
      >
        {TABS.map((tab) => (
          <Tab
            key={tab.to}
            value={tab.to}
            label={tab.label}
            component={Link}
            to={`${tab.to}?${search}`}
          />
        ))}
      </Tabs>
      <PeriodFilters
        companies={filters.companies.data?.items}
        companyId={filters.companyId}
        month={filters.monthText}
        onCompany={filters.setCompany}
        onMonth={filters.setMonth}
      />
      <Stack spacing={2} sx={{ mb: 2 }}>
        <ErrorAlert error={filters.companies.error ?? props.error} />
        {props.status && (
          <StatusDot tone={STATUS_TONES[props.status]}>
            {REPORT_STATUS_LABELS[props.status]}
          </StatusDot>
        )}
      </Stack>
      {props.children}
    </>
  );
}

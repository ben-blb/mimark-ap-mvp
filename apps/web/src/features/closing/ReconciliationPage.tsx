import type { CantaloupeStatus } from '@mimark/contracts/closing-review';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link } from 'react-router';
import { DataRow, DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Money } from '../../components/Money';
import { PageHeader } from '../../components/PageHeader';
import { StatusDot, type DotTone } from '../../components/StatusDot';
import { formatDate } from '../../lib/format';
import { CANTALOUPE_STATUS_LABELS } from '../../lib/labels';
import { useCan } from '../session/session.api';
import { ChecksPanel } from './ChecksPanel';
import { PeriodFilters, currentMonth, isMonth } from './PeriodFilters';
import { ReopenDialog } from './ReopenDialog';
import { useCompanies } from './closing.api';
import { useCantaloupe, useChecks, useClosePeriod, usePeriod, useReview } from './review.api';

const CANTALOUPE_TONES: Record<CantaloupeStatus, DotTone> = {
  ok: 'success',
  warning: 'warning',
  missing: 'error',
  orphan: 'warning',
};

/** Conciliación de Cantaloupe contra el banco, cuadres y cierre del periodo (spec 023). */
export function ReconciliationPage() {
  const can = useCan();
  const canWrite = can('reports:write');
  const companies = useCompanies(false);
  const [companyChoice, setCompanyChoice] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [reopening, setReopening] = useState(false);

  const companyId = companyChoice || companies.data?.items[0]?.id || '';
  const period = usePeriod(companyId, isMonth(month) ? month : '');
  const periodId = period.data?.id ?? '';
  const cantaloupe = useCantaloupe(periodId);
  const checks = useChecks(periodId);
  const pending = useReview({ periodId });
  const close = useClosePeriod();

  const closed = period.data?.status === 'closed';
  const errors = checks.data?.items.filter((c) => c.status === 'error').length ?? 0;
  const pendingReview = pending.data?.items.length ?? 0;
  // Solo explica; quien decide si se puede cerrar es la API.
  const blockers = [
    errors > 0 && `${errors} cuadre(s) que no cuadran`,
    pendingReview > 0 && `${pendingReview} movimiento(s) por revisar`,
  ].filter(Boolean);
  const loaded = !!checks.data && !!pending.data;

  return (
    <>
      <PageHeader
        title="Conciliación"
        actions={
          <Button component={Link} to="/cierre/por-revisar" color="inherit">
            Por revisar
          </Button>
        }
      />
      <PeriodFilters
        companies={companies.data?.items}
        companyId={companyId}
        month={month}
        onCompany={setCompanyChoice}
        onMonth={setMonth}
      />
      <Stack spacing={2} sx={{ mb: 2 }}>
        <ErrorAlert
          error={companies.error ?? period.error ?? cantaloupe.error ?? checks.error ?? close.error}
        />
      </Stack>

      {period.data === null && (
        <EmptyState>Este mes todavía no tiene cargas. Sube las fuentes en «Cargas».</EmptyState>
      )}

      {period.data && (
        <Stack spacing={5}>
          <Stack component="section" aria-labelledby="close-title" spacing={1.5}>
            <Typography id="close-title" variant="h2">
              Cierre del periodo
            </Typography>
            {closed ? (
              <Alert
                severity="info"
                action={
                  canWrite && (
                    <Button color="inherit" size="small" onClick={() => setReopening(true)}>
                      Reabrir
                    </Button>
                  )
                }
              >
                Cerrado por {period.data.closedBy}. Ya no admite cambios.
              </Alert>
            ) : (
              canWrite && (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Button
                    variant="contained"
                    disabled={!loaded || blockers.length > 0 || close.isPending}
                    aria-describedby="close-reason"
                    onClick={() => close.mutate(periodId)}
                  >
                    Cerrar periodo
                  </Button>
                  <Typography id="close-reason" variant="body2" color="text.secondary">
                    {blockers.length > 0
                      ? `No se puede cerrar: hay ${blockers.join(' y ')}.`
                      : loaded
                        ? 'Todo cuadra: ya se puede cerrar.'
                        : 'Revisando los cuadres…'}
                  </Typography>
                </Stack>
              )
            )}
          </Stack>

          <Stack component="section" aria-labelledby="checks-title" spacing={1}>
            <Typography id="checks-title" variant="h2">
              Cuadres
            </Typography>
            <ChecksPanel checks={checks.data?.items ?? []} />
          </Stack>

          <Stack component="section" aria-labelledby="cantaloupe-title" spacing={1}>
            <Typography id="cantaloupe-title" variant="h2">
              Cantaloupe contra el banco
            </Typography>
            <Typography variant="body2" color="text.secondary">
              El depósito esperado es la venta menos la comisión ({cantaloupe.data?.rate ?? '…'}) y
              su IVA. Sábado y domingo se concilian con el lunes.
            </Typography>
            <DataTable
              aria-label="Conciliación de Cantaloupe"
              items={cantaloupe.data?.items}
              loading={cantaloupe.isLoading}
              getKey={(row) => row.date}
              empty="No hay ventas de Cantaloupe ni depósitos este mes."
              head={
                <TableRow>
                  <TableCell>Día</TableCell>
                  <TableCell align="right">Ventas</TableCell>
                  <TableCell align="right">Comisión</TableCell>
                  <TableCell align="right">IVA</TableCell>
                  <TableCell align="right">Esperado</TableCell>
                  <TableCell align="right">Depósito</TableCell>
                  <TableCell align="right">Diferencia</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              }
              row={(row) => (
                <DataRow key={row.date}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatDate(row.date)}
                    {row.groupedDays.length > 1 && (
                      <Typography variant="caption" component="div" color="text.secondary">
                        Incluye {row.groupedDays.map(formatDate).join(', ')}
                      </Typography>
                    )}
                  </TableCell>
                  {[
                    row.sales,
                    row.commission,
                    row.vat,
                    row.expected,
                    row.deposit,
                    row.difference,
                  ].map((amount, i) => (
                    <TableCell key={i} align="right">
                      <Money amount={amount} currency="MXN" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <StatusDot tone={CANTALOUPE_TONES[row.status]}>
                      {CANTALOUPE_STATUS_LABELS[row.status]}
                    </StatusDot>
                  </TableCell>
                </DataRow>
              )}
              card={(row) => (
                <Stack spacing={0.5}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography sx={{ fontWeight: 500 }}>{formatDate(row.date)}</Typography>
                    <StatusDot tone={CANTALOUPE_TONES[row.status]}>
                      {CANTALOUPE_STATUS_LABELS[row.status]}
                    </StatusDot>
                  </Stack>
                  <Typography variant="body2">
                    Esperado <Money amount={row.expected} currency="MXN" /> · Depósito{' '}
                    <Money amount={row.deposit} currency="MXN" />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Diferencia <Money amount={row.difference} currency="MXN" />
                  </Typography>
                </Stack>
              )}
            />
          </Stack>
        </Stack>
      )}
      {reopening && <ReopenDialog periodId={periodId} onClose={() => setReopening(false)} />}
    </>
  );
}

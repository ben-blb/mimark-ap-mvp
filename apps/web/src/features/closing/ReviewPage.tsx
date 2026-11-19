import type { ReviewItemDto, ReviewQuery } from '@mimark/contracts/closing-review';
import type { Source } from '@mimark/contracts/closing-uploads';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link } from 'react-router';
import { DataRow, DataTable, Ellipsis } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Money } from '../../components/Money';
import { PageHeader } from '../../components/PageHeader';
import { formatDate } from '../../lib/format';
import { QUEUE_REASON_LABELS, SOURCE_LABELS } from '../../lib/labels';
import { useCan } from '../session/session.api';
import { ClassifyControls } from './ClassifyControls';
import { PeriodFilters, currentMonth, isMonth } from './PeriodFilters';
import { RuleDialog } from './RuleDialog';
import { useAccounts, useCategories, useCompanies } from './closing.api';
import {
  useClassifyEntry,
  useClassifyPeriod,
  useConfirmTransfer,
  usePeriod,
  useReview,
} from './review.api';

const REVIEW_SOURCES: Source[] = [
  'parlevel_sales',
  'parlevel_waste',
  'bank_csv',
  'bank_pdf',
  'cash',
];

/** Cola «Por revisar»: lo que ninguna regla clasificó, y los traspasos propuestos (spec 023). */
export function ReviewPage() {
  const can = useCan();
  const canWrite = can('reports:write');
  const companies = useCompanies(false);
  const [companyChoice, setCompanyChoice] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [source, setSource] = useState('');
  const [accountId, setAccountId] = useState('');
  const [ruleFor, setRuleFor] = useState<{ item: ReviewItemDto; categoryId: string } | null>(null);
  const [notice, setNotice] = useState('');

  const companyId = companyChoice || companies.data?.items[0]?.id || '';
  const period = usePeriod(companyId, isMonth(month) ? month : '');
  const periodId = period.data?.id ?? '';
  const review = useReview({
    periodId,
    source: (source || undefined) as ReviewQuery['source'],
    accountId: accountId || undefined,
  });
  const categories = useCategories().data?.items ?? [];
  const accounts = useAccounts(false).data?.items.filter((a) => a.companyId === companyId) ?? [];
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  const classifyPeriod = useClassifyPeriod();
  const classifyEntry = useClassifyEntry();
  const confirmTransfer = useConfirmTransfer();
  const closed = period.data?.status === 'closed';
  const editable = canWrite && !closed;
  const items = review.data?.items;
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const error = classifyPeriod.error ?? classifyEntry.error ?? confirmTransfer.error;

  const accountOf = (item: ReviewItemDto) =>
    item.accountId ? (accountNames[item.accountId] ?? 'Cuenta') : '—';

  const controls = (item: ReviewItemDto) =>
    editable && (
      <ClassifyControls
        concept={item.concept}
        categories={categories}
        suggested={item.suggestedCategoryId}
        pending={classifyEntry.isPending}
        onClassify={(categoryId) => classifyEntry.mutate({ id: item.id, categoryId })}
        onRule={(categoryId) => setRuleFor({ item, categoryId })}
      />
    );

  return (
    <>
      <PageHeader
        title="Por revisar"
        actions={
          <>
            <Button component={Link} to="/cierre/conciliacion" color="inherit">
              Conciliación
            </Button>
            {canWrite && (
              <Button component={Link} to="/cierre/cargas" color="inherit">
                Cargas
              </Button>
            )}
          </>
        }
      />
      <PeriodFilters
        companies={companies.data?.items}
        companyId={companyId}
        month={month}
        onCompany={setCompanyChoice}
        onMonth={setMonth}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          label="Fuente"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          slotProps={{ select: { native: true } }}
          sx={{ minWidth: 220 }}
        >
          <option value="">Todas</option>
          {REVIEW_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </TextField>
        <TextField
          select
          label="Cuenta"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          slotProps={{ select: { native: true } }}
          sx={{ minWidth: 220 }}
        >
          <option value="">Todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </TextField>
        {editable && periodId && (
          <Button
            variant="outlined"
            sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 1 } }}
            disabled={classifyPeriod.isPending}
            onClick={() =>
              classifyPeriod.mutate(periodId, {
                onSuccess: (r) =>
                  setNotice(
                    `Se clasificaron ${r.classified} movimientos con reglas; quedan ${r.needsReview} por revisar.`,
                  ),
              })
            }
          >
            Clasificar con reglas
          </Button>
        )}
      </Stack>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <ErrorAlert error={companies.error ?? period.error ?? review.error ?? error} />
        {closed && <Alert severity="info">Este periodo está cerrado: ya no admite cambios.</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
      </Stack>

      {period.data === null && (
        <EmptyState>Este mes todavía no tiene cargas. Sube las fuentes en «Cargas».</EmptyState>
      )}

      {(review.data?.transfers.length ?? 0) > 0 && (
        <Stack component="section" aria-labelledby="transfers-title" spacing={1.5} sx={{ mb: 4 }}>
          <Typography id="transfers-title" variant="h2">
            Posibles traspasos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mismo monto, signo opuesto y cuentas distintas. Confírmalos para que no cuenten como
            ingreso ni egreso.
          </Typography>
          {review.data?.transfers.map(({ entryIds }) => {
            const [a, b] = entryIds.map((id) => byId.get(id));
            return (
              <Stack
                key={entryIds.join('-')}
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  alignItems: { md: 'center' },
                }}
              >
                {[a, b].map(
                  (side, i) =>
                    side && (
                      <Stack key={entryIds[i]} sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2">
                          {formatDate(side.date)} · {accountOf(side)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {side.concept}
                        </Typography>
                        <Money amount={side.amount} currency="MXN" />
                      </Stack>
                    ),
                )}
                {editable && (
                  <Button
                    disabled={confirmTransfer.isPending}
                    onClick={() => confirmTransfer.mutate(entryIds)}
                  >
                    Confirmar traspaso
                  </Button>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      {period.data && (
        <DataTable
          aria-label="Movimientos por revisar"
          items={items}
          loading={review.isLoading}
          getKey={(item) => item.id}
          empty="No hay movimientos por revisar."
          head={
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell>Fuente</TableCell>
              <TableCell>Cuenta</TableCell>
              <TableCell>Concepto</TableCell>
              <TableCell align="right">Importe</TableCell>
              <TableCell>Motivo</TableCell>
              {editable && <TableCell>Categoría</TableCell>}
            </TableRow>
          }
          row={(item) => (
            <DataRow key={item.id}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.date)}</TableCell>
              <TableCell>{SOURCE_LABELS[item.source]}</TableCell>
              <TableCell>{accountOf(item)}</TableCell>
              <TableCell>
                <Ellipsis maxWidth={320}>{item.concept}</Ellipsis>
              </TableCell>
              <TableCell align="right">
                <Money amount={item.amount} currency="MXN" />
              </TableCell>
              <TableCell>
                {item.possibleTransferWith ? 'Posible traspaso' : QUEUE_REASON_LABELS[item.reason]}
              </TableCell>
              {editable && <TableCell>{controls(item)}</TableCell>}
            </DataRow>
          )}
          card={(item) => (
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                {formatDate(item.date)} · {SOURCE_LABELS[item.source]} · {accountOf(item)}
              </Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{item.concept}</Typography>
              <Money amount={item.amount} currency="MXN" />
              <Typography variant="body2" color="text.secondary">
                {item.possibleTransferWith ? 'Posible traspaso' : QUEUE_REASON_LABELS[item.reason]}
              </Typography>
              {controls(item)}
            </Stack>
          )}
        />
      )}

      {ruleFor && (
        <RuleDialog
          item={ruleFor.item}
          categoryId={ruleFor.categoryId}
          categories={categories}
          onClose={() => setRuleFor(null)}
          onDone={(reclassified) => {
            setRuleFor(null);
            setNotice(
              reclassified === 0
                ? 'Regla guardada.'
                : `Regla guardada: se clasificaron ${reclassified} movimientos más.`,
            );
          }}
        />
      )}
    </>
  );
}

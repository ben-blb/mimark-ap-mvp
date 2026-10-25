import type { Horizon } from '@mimark/contracts/dashboard';
import LinearProgress from '@mui/material/LinearProgress';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { useDashboard } from './dashboard.api';
import { DashboardView } from './DashboardView';

export function DashboardPage() {
  const [horizon, setHorizon] = useState<Horizon>(15);
  const dashboard = useDashboard(horizon);

  return (
    <>
      <PageHeader
        title="Tablero"
        subtitle="Qué hay que pagar, qué ya venció y qué espera revisión."
      />
      <ErrorAlert error={dashboard.error} />
      {dashboard.isFetching && <LinearProgress sx={{ mb: 1 }} />}
      {dashboard.data && (
        <DashboardView data={dashboard.data} horizon={horizon} onHorizonChange={setHorizon} />
      )}
    </>
  );
}

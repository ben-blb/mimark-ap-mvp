import type { Horizon } from '@mimark/contracts/dashboard';
import LinearProgress from '@mui/material/LinearProgress';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { useCan } from '../session/session.api';
import { useDashboard } from './dashboard.api';
import { DashboardView, HorizonTabs } from './DashboardView';

export function DashboardPage() {
  const [horizon, setHorizon] = useState<Horizon>(15);
  const dashboard = useDashboard(horizon);
  const canViewReports = useCan()('reports:view');

  return (
    <>
      <PageHeader
        title="Tablero"
        actions={
          <>
            {canViewReports && (
              <Button component={Link} to="/reportes/edo-res" color="inherit">
                Reportes
              </Button>
            )}
            <HorizonTabs value={horizon} onChange={setHorizon} />
          </>
        }
      />
      <ErrorAlert error={dashboard.error} />
      {dashboard.isFetching && <LinearProgress sx={{ mb: 1 }} />}
      {dashboard.data && <DashboardView data={dashboard.data} horizon={horizon} />}
    </>
  );
}

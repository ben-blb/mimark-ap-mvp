import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { useCan } from '../session/session.api';
import { CatalogTab } from './CatalogTab';
import { RuleTester } from './RuleTester';
import { useCatalogTabs } from './catalog.tabs';

export function CatalogPage() {
  const canWrite = useCan()('reports:write');
  const [tab, setTab] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const tabs = useCatalogTabs(showInactive);

  return (
    <>
      <PageHeader
        title="Catálogo del cierre"
        actions={
          canWrite && (
            <Button component={Link} to="/cierre/cargas" variant="outlined">
              Cargas del mes
            </Button>
          )
        }
      />
      <Stack
        direction="row"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, alignItems: 'center' }}
      >
        <Tabs
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flexGrow: 1 }}
        >
          {['Empresas', 'Kioskos', 'Cuentas', 'Categorías', 'Reglas'].map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
        <FormControlLabel
          label="Ver inactivos"
          sx={{ flexShrink: 0, mr: 0 }}
          control={
            <Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          }
        />
      </Stack>
      {tab === 0 && <CatalogTab def={tabs.companies} canWrite={canWrite} />}
      {tab === 1 && <CatalogTab def={tabs.kiosks} canWrite={canWrite} />}
      {tab === 2 && <CatalogTab def={tabs.accounts} canWrite={canWrite} />}
      {tab === 3 && <CatalogTab def={tabs.categories} canWrite={canWrite} />}
      {tab === 4 && (
        <>
          <RuleTester />
          <CatalogTab def={tabs.rules} canWrite={canWrite} />
        </>
      )}
    </>
  );
}
